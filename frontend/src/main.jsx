import { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Banknote, House, LayoutDashboard, Layers3, Settings2, Moon, Sun, ChevronRight, ShieldCheck, Menu, X, ReceiptText, Tags, CreditCard } from 'lucide-react'
import { api } from './api'
import { ErrorNotice } from './components'
import { Overview } from './overview'
import { Categories } from './categories'
import { ExpenseDialog, Expenses } from './expenses'
import { CreditsPage } from './income'
import { PaymentMethodsPage } from './payment-methods'
import { TagsPage } from './tags'
import { Settings } from './settings'
import { addMonthsToDate, localDate, localMonth } from './finance'
import './style.css'

const pages = [
  { id: 'inicio', label: 'Visão geral', Icon: LayoutDashboard },
  { id: 'despesas', label: 'Despesas', Icon: ReceiptText },
  { id: 'creditos', label: 'Créditos', Icon: Banknote },
  { id: 'pagamentos', label: 'Formas de pagamento', Icon: CreditCard },
  { id: 'categorias', label: 'Categorias', Icon: Layers3 },
  { id: 'tags', label: 'Tags', Icon: Tags },
  { id: 'configuracoes', label: 'Configurações', Icon: Settings2 },
]

function pageFromUrl() {
  return pages.find(item => `#${item.id}` === location.hash) || pages[0]
}

function App() {
  const [page, setPage] = useState(pageFromUrl)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [month, setMonth] = useState(localMonth)
  const [expenseDialog, setExpenseDialog] = useState(null)
  const [expenseVersion, setExpenseVersion] = useState(0)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  const [switching, setSwitching] = useState(false)
  const refresh = useCallback(async () => {
    setError('')
    try {
      const [settings, classifications, revisions, tags, paymentMethods] = await Promise.all([
        api('/settings'), api('/classifications'), api('/salary-revisions'), api('/tags'), api('/payment-methods'),
      ])
      setData({ settings, classifications, revisions, tags, paymentMethods })
    } catch (failure) {
      setError(failure.message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    function navigate() { setPage(pageFromUrl()); setMobileOpen(false); setExpenseDialog(null); window.scrollTo(0, 0) }
    addEventListener('hashchange', navigate)
    return () => removeEventListener('hashchange', navigate)
  }, [])
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const update = event => setSystemDark(event.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timeout = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(timeout)
  }, [notice])

  const theme = data?.settings.theme
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const horizon = data && addMonthsToDate(localDate(), data.settings.projection_months)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.title = `${data?.settings.name || 'Moradia'} | Gestão Financeira`
  }, [dark, data?.settings.name])

  async function toggleTheme() {
    setSwitching(true)
    try {
      const settings = await api('/settings/theme', 'PATCH', { theme: dark ? 'light' : 'dark' })
      setData(previous => ({ ...previous, settings }))
    } catch (failure) { setError(failure.message) }
    finally { setSwitching(false) }
  }

  function newExpense() { setExpenseDialog({}) }

  function expenseSaved(expense, message) {
    setExpenseDialog(null)
    if (!expenseDialog?.close && !expenseDialog?.remove) {
      const purchase = expense.purchase_installment
      if (purchase) {
        const first = purchase.due_on.slice(0, 7)
        const last = addMonthsToDate(purchase.due_on, purchase.total - 1).slice(0, 7)
        if (!expenseDialog?.expense || month < first || month > last) setMonth(first)
      } else {
        const start = (expense.starts_on || expense.occurred_on).slice(0, 7)
        const end = (expense.ends_on && expense.ends_on < horizon ? expense.ends_on : horizon).slice(0, 7)
        if (expense.kind === 'avulsa' || month < start || month > end) setMonth(start)
      }
    }
    setExpenseVersion(value => value + 1)
    setNotice(message)
  }

  return <div className="shell">
    {mobileOpen && <button className="nav-shade" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <a className="brand" href="#inicio" onClick={() => setMobileOpen(false)}>
        <span className="brand-mark"><House size={21} strokeWidth={2.4} /></span>
        <span><strong>{data?.settings.name || 'Moradia'}</strong><small>Gestão Financeira</small></span>
      </a>
      <nav aria-label="Menu principal">
        {pages.map(({ id, label, Icon }) => <a key={id} href={`#${id}`}
          onClick={() => setMobileOpen(false)} aria-current={page.id === id ? 'page' : undefined}>
          <Icon size={19} strokeWidth={1.8} />{label}
        </a>)}
      </nav>
      <div className="sidebar-bottom"><ShieldCheck size={18} /><span>Armazenamento local</span></div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb">
          <button className="icon-button mobile-toggle" aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button>
          <span>{data?.settings.name || 'Moradia'}</span><ChevronRight size={14} /><strong>{page.label}</strong>
        </div>
        <button className="icon-button theme-button" aria-label={dark ? 'Ativar tema claro' : 'Ativar tema escuro'}
          disabled={!data || switching} onClick={toggleTheme}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
      </header>
      <main className="content" id="principal">
        <ErrorNotice message={error} />
        {!data && (error
          ? <button className="button secondary" onClick={refresh}>Tentar novamente</button>
          : <p role="status">Carregando seus dados…</p>)}
        {data && page.id === 'inicio' && <Overview {...data} month={month} setMonth={setMonth}
          horizon={horizon} notify={setNotice} expenseVersion={expenseVersion} onNewExpense={newExpense} />}
        {data && page.id === 'despesas' && <Expenses classifications={data.classifications} tags={data.tags}
          currency={data.settings.currency} month={month} setMonth={setMonth} horizon={horizon} version={expenseVersion} onNew={newExpense}
          onEdit={expense => setExpenseDialog({ expense })} onDelete={expense => setExpenseDialog({ expense, remove: true })}
          onCloseExpense={expense => setExpenseDialog({ expense, close: true })}
          onAdvanced={(paidOn, count) => {
            setMonth(paidOn.slice(0, 7))
            setExpenseVersion(value => value + 1)
            setNotice(count === 1 ? 'Parcela antecipada.' : `${count} parcelas antecipadas.`)
          }} />}
        {data && page.id === 'creditos' && <CreditsPage month={month} setMonth={setMonth} horizon={horizon}
          tags={data.tags} currency={data.settings.currency} notify={setNotice} />}
        {data && page.id === 'categorias' && <Categories items={data.classifications} settings={data.settings}
          refresh={refresh} notify={setNotice} />}
        {data && page.id === 'pagamentos' && <PaymentMethodsPage methods={data.paymentMethods} refresh={refresh} notify={setNotice} />}
        {data && page.id === 'tags' && <TagsPage tags={data.tags} refresh={refresh} notify={setNotice} />}
        {data && page.id === 'configuracoes' && <Settings settings={data.settings} revisions={data.revisions}
          refresh={refresh} notify={setNotice} />}
      </main>
    </div>
    {data && expenseDialog && <ExpenseDialog {...expenseDialog} classifications={data.classifications}
      tags={data.tags} paymentMethods={data.paymentMethods} currency={data.settings.currency} month={month} horizon={horizon}
      onClose={() => setExpenseDialog(null)} onSaved={expenseSaved} />}
    {notice && <div className="toast" role="status">{notice}</div>}
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
