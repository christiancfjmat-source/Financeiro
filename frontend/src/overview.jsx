import { useState } from 'react'
import { Wallet, ShieldCheck, ChevronRight, House, Utensils, CarFront, HeartPulse, ShoppingBag, Sparkles, Handshake, Shapes, Plus, ReceiptText, Percent, Banknote } from 'lucide-react'
import { CalendarMonthPicker, ErrorNotice } from './components'
import { BudgetUsage } from './budgets'
import { budgetPercent, formatMoney } from './finance'
import { useMonthData } from './month-data'
import { BudgetGauge, DepartmentDonut } from './overview-charts'
import { CreditForm } from './income'

export const tones = ['green', 'orange', 'blue', 'rose', 'purple', 'gold', 'teal', 'slate']
export const departmentIcons = [House, Utensils, CarFront, HeartPulse, ShoppingBag, Sparkles, Handshake, Shapes]

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

export function Overview({ settings, classifications, revisions, tags, month, setMonth, horizon, notify, expenseVersion, onNewExpense }) {
  const { data: income, error: incomeError, reload: reloadIncome } = useMonthData('/income', month, revisions)
  const { data: report, error: reportError, reload } = useMonthData('/spending', month, expenseVersion)
  const [creditOpen, setCreditOpen] = useState(false)
  const money = value => formatMoney(value, settings.currency)
  const balance = income && report ? income.total_cents - report.total_cents : null
  const share = income?.total_cents && report ? percent.format(report.total_cents / income.total_cents) : '—'
  const budgetTotal = report?.budgets.reduce((total, budget) => total + budget.limit_cents, 0)
  const budgetShare = budgetTotal > 0 ? percent.format(report.total_cents / budgetTotal) : '—'
  const overBudget = budgetTotal > 0 && report.total_cents > budgetTotal
  const names = new Map(classifications.map(item => [item.id, item.name]))
  const parents = new Map(classifications.map(item => [item.id, item.parent_id]))

  return <>
    <section className="page-heading overview-heading">
      <div><h1>Visão geral</h1><p>Acompanhe a renda prevista, os gastos e os tetos do mês.</p></div>
      <div className="heading-actions">
        <CalendarMonthPicker month={month} setMonth={setMonth} />
        <button className="button secondary" onClick={() => setCreditOpen(true)}><Banknote size={18} /> Novo crédito</button>
        <button className="button primary" onClick={onNewExpense}><Plus size={18} /> Nova despesa</button>
      </div>
    </section>
    {incomeError && <div className="report-error"><ErrorNotice message={incomeError} />
      <button className="button secondary compact" onClick={reloadIncome}>Recarregar renda</button></div>}
    <section className="metrics metrics-spending" aria-label="Indicadores financeiros">
      <Metric Icon={ReceiptText} tone="rose" title="Despesas do mês" value={money(report?.total_cents)}
        detail={report ? `${report.expense_count} ${report.expense_count === 1 ? 'lançamento' : 'lançamentos'}` : 'Total da competência'} />
      <Metric Icon={Percent} tone="orange" title="Renda comprometida" value={share}
        detail={`Renda do mês ${money(income?.total_cents)}`} />
      <Metric Icon={Wallet} tone={balance < 0 ? 'rose' : 'green'} title="Saldo do mês" value={money(balance)}
        detail="Renda do mês menos despesas" negative={balance < 0} />
      <Metric Icon={ShieldCheck} tone={overBudget ? 'rose' : 'purple'} title="Teto utilizado" value={budgetShare}
        detail={`Teto total ${money(budgetTotal)}`} negative={overBudget} />
    </section>
    {reportError && <div className="report-error"><ErrorNotice message={reportError} />
      <button className="button secondary compact" onClick={reload}>Tentar novamente</button></div>}
    <div className="overview-visuals">
      <BudgetGauge spent={report?.total_cents} budget={budgetTotal} income={income?.total_cents} money={money}
        error={reportError || incomeError} />
      <DepartmentDonut amounts={report?.by_department} classifications={classifications} money={money} error={reportError} />
    </div>
    <div className="overview-grid">
      <CategorySpending amounts={report?.by_category} names={names} money={money}
        error={reportError} parents={parents} budgets={report?.budgets} />
      <DepartmentBudgets report={report} error={reportError} classifications={classifications} settings={settings} money={money} />
    </div>
    {creditOpen && <CreditForm month={month} horizon={horizon} tags={tags} currency={settings.currency}
      onClose={() => setCreditOpen(false)} onSave={reference => {
        setMonth(reference)
        setCreditOpen(false)
        reloadIncome()
        notify('Crédito salvo.')
      }} />}
  </>
}

function DepartmentBudgets({ report, error, classifications, settings, money }) {
  const caps = new Map(report?.budgets.map(budget => [budget.category_id, budget.limit_cents]))
  const departments = new Map(classifications.filter(item => item.level === 1).map(item => [
    item.id, { name: item.name, limit: 0, spent: 0, categories: [] },
  ]))
  for (const category of classifications.filter(item => item.level === 2)) {
    const department = departments.get(category.parent_id)
    const limit = caps.get(category.id) ?? 0
    const spent = report?.by_category[category.id] ?? 0
    department.limit += limit
    department.spent += spent
    department.categories.push({
      id: category.id, name: category.name, limit_cents: limit, spent_cents: spent, available_cents: limit - spent,
    })
  }

  return <section className="panel distribution" aria-label="Tetos por departamento">
    <div className="panel-heading">
      <div><h2>Tetos por departamento</h2><p>Soma dos tetos de cada categoria</p></div>
      <a className="button secondary compact" href="#categorias">Configurar</a>
    </div>
    {!report && !error && <p className="empty" role="status">Carregando tetos…</p>}
    {report && (departments.size === 0 ? <p className="empty">Nenhum departamento cadastrado.</p>
      : <ul className="budget-departments">{[...departments].map(([id, department]) => {
        const available = department.limit - department.spent
        return <li key={id}>
          <details>
            <summary><ChevronRight size={16} aria-hidden="true" />
              <span className="department-budget-heading">
                <strong>{department.name}</strong><span>Teto {money(department.limit)}</span>
              </span>
              {(department.limit > 0 || department.spent > 0) &&
                <span className="department-budget-balance">
                  <span>Gastos {money(department.spent)}</span>
                  <span className={available < 0 ? 'negative-value' : undefined}>
                    {available < 0 ? `${money(-available)} acima do teto` : `${money(available)} disponível`}
                  </span>
                </span>}
            </summary>
            {department.categories.length === 0 ? <p className="empty">Nenhuma categoria neste departamento.</p>
              : <ul className="budget-categories">{department.categories.map(category =>
                <li key={category.id}>
                  <strong>{category.name}</strong>
                  {category.limit_cents > 0 || category.spent_cents > 0
                    ? <BudgetUsage budget={category} settings={settings} />
                    : <span className="budget-zero">Teto {money(0)}</span>}
                </li>)}</ul>}
          </details>
        </li>
      })}</ul>)}
  </section>
}

function CategorySpending({ amounts, names, money, error, parents, budgets }) {
  const entries = Object.entries(amounts || {}).sort((a, b) => b[1] - a[1])
  const largest = entries[0]?.[1]
  const caps = new Map(budgets?.map(budget => [budget.category_id, budget.limit_cents]))
  return <section className="panel distribution" aria-label="Gastos por categoria">
    <div className="panel-heading">
      <div><h2>Gastos por categoria</h2><p>Despesas do mês selecionado</p></div>
      <a className="button secondary compact" href="#despesas">Ver despesas</a>
    </div>
    {!amounts && !error && <p className="empty" role="status">Carregando gastos…</p>}
    {amounts && (entries.length === 0 ? <p className="empty">Nenhuma despesa registrada neste mês.</p>
      : <ul className="category-spending">{entries.map(([key, value], index) => {
        const id = Number(key)
        const cap = caps.get(id)
        return <li key={id}>
          <div><span>{names.get(id)}</span><small>{names.get(parents.get(id))}</small></div>
          <strong>{money(value)}</strong>
          <span className={`chart-cap ${cap != null && value > cap ? 'cap-over' : ''}`}>
            {cap == null ? 'Sem teto' : cap === 0 ? 'Teto zero' : `${budgetPercent(value, cap)}% do teto`}
          </span>
          <span className="bar-track" aria-hidden="true"><span className={`bar-fill ${tones[index % tones.length]}`}
            style={{ width: `${value / largest * 100}%` }} /></span>
        </li>
      })}</ul>)}
  </section>
}

function Metric({ Icon, tone, title, value, detail, negative }) {
  return <article className="metric panel" aria-label={title}><span className={`tile-icon ${tone}`}><Icon size={19} /></span>
    <div><h2>{title}</h2><strong className={negative ? 'negative-value' : undefined}>{value}</strong><p>{detail}</p></div>
  </article>
}
