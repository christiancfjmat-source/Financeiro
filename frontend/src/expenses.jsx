import { useState } from 'react'
import { CalendarArrowDown, CircleStop, CreditCard, Pencil, Plus, ReceiptText, Repeat2, Search, Trash2 } from 'lucide-react'
import { api } from './api'
import { AdvanceDialog, creditLabels } from './advances'
import { DeleteModal, ErrorNotice, Modal, MoneyInput, MonthPicker, TagPicker } from './components'
import { cardDueOn, dateLabel, formatMoney, localDate, monthLabel, parseMoney } from './finance'
import { useMonthData } from './month-data'
import { paymentKinds } from './payment-methods'

export function Expenses({ classifications, tags, currency, month, setMonth, horizon, version, onNew, onEdit, onDelete, onCloseExpense, onAdvanced }) {
  const { data, error, reload } = useMonthData('/expenses', month, version)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [showAdvance, setShowAdvance] = useState(false)
  const names = new Map(classifications.map(item => [item.id, item.name]))
  const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
  const filtered = data?.filter(expense => {
    const { installment, purchase_installment: purchase, advance } = expense
    const types = [expense.kind, expense.credit_kind, advance && 'antecipada']
    const labels = [expense.description, names.get(expense.department_id), names.get(expense.category_id),
      names.get(expense.subcategory_id), ...expense.tags.map(tag => tag.name),
      creditLabels[expense.credit_kind], installment?.agreement_description,
      installment && `parcela ${installment.number}/${installment.total}`,
      purchase && `parcela ${purchase.number}/${purchase.total} ${dateLabel(purchase.purchase_on)}`,
      installment && dateLabel(installment.scheduled_on), advance && 'antecipada antecipação',
      expense.payment_method.name, expense.payment_due_on && dateLabel(expense.payment_due_on)]
    return (!categoryFilter || Number(categoryFilter) === expense.category_id) &&
      (!tagFilter || expense.tags.some(tag => tag.id === Number(tagFilter))) &&
      (!kindFilter || types.includes(kindFilter)) &&
      normalize(labels.filter(Boolean).join(' ')).includes(normalize(query.trim()))
  })
  const filteredTotal = filtered?.reduce((sum, expense) => sum + expense.amount_cents, 0)

  return <>
    <section className="page-heading expense-heading">
      <div><h1>Despesas</h1><p>Despesas fixas projetadas até {dateLabel(horizon)}.</p></div>
      <div className="heading-actions">
        <MonthPicker month={month} setMonth={setMonth} />
        <button className="button secondary" onClick={() => setShowAdvance(true)}><CalendarArrowDown size={18} /> Antecipar parcelas</button>
        <button className="button primary" onClick={onNew}><Plus size={18} /> Nova despesa</button>
      </div>
    </section>
    <section className="panel">
      <div className="filter-row expense-filters">
        <label className="search"><Search size={18} /><input type="search" aria-label="Buscar despesas"
          placeholder="Buscar lançamentos" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Filtrar despesas por categoria" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
          <option value="">Todas as categorias</option>
          {classifications.filter(item => item.level === 1).map(department =>
            <optgroup key={department.id} label={department.name}>
              {classifications.filter(item => item.parent_id === department.id).map(item =>
                <option key={item.id} value={item.id}>{item.name}</option>)}
            </optgroup>)}
        </select>
        <select aria-label="Filtrar despesas por tag" value={tagFilter} onChange={event => setTagFilter(event.target.value)}>
          <option value="">Todas as tags</option>
          {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select>
        <select aria-label="Filtrar por tipo de despesa" value={kindFilter} onChange={event => setKindFilter(event.target.value)}>
          <option value="">Todos os tipos</option><option value="fixa">Fixas</option><option value="avulsa">Avulsas</option>
          <option value="emprestimo">Empréstimos</option><option value="financiamento">Financiamentos</option>
          <option value="antecipada">Antecipadas</option>
        </select>
      </div>
      {error && <div className="inset"><ErrorNotice message={error} /><button className="button secondary" onClick={reload}>Tentar novamente</button></div>}
      {!data && !error && <p className="empty" role="status">Carregando despesas…</p>}
      {filtered && <div className="expense-summary">
        <span>{filtered.length} {filtered.length === 1 ? 'lançamento exibido' : 'lançamentos exibidos'}</span>
        <strong>{formatMoney(filteredTotal, currency)}</strong>
      </div>}
      {filtered?.length === 0 && <div className="empty expense-empty">
        <ReceiptText size={22} />
        <p>{data.length ? 'Nenhum lançamento corresponde aos filtros.' : `Nenhuma despesa em ${monthLabel(month)}.`}</p>
        {!data.length && <button className="button secondary compact" onClick={onNew}>Lançar despesa</button>}
      </div>}
      {filtered?.length > 0 && <ul className="expense-list" aria-label="Lançamentos do mês">
        {filtered.map(expense => <li className="expense-row" key={expense.id}>
          <time dateTime={expense.occurred_on}>{dateLabel(expense.occurred_on)}</time>
          <div className="expense-description">
            <strong>{expense.description || names.get(expense.category_id)}</strong>
            <small>{[names.get(expense.department_id), names.get(expense.category_id), names.get(expense.subcategory_id)]
              .filter(Boolean).join(' / ')}</small>
            {expense.payment_method.kind !== 'financiamento' && <small>
              {expense.payment_method.name}{expense.payment_due_on && ` · Vencimento previsto em ${dateLabel(expense.payment_due_on)}`}
            </small>}
            {expense.installment && <small className="recurrence-label"><Repeat2 size={14} />
              {creditLabels[expense.installment.kind]} · Parcela {expense.installment.number}/{expense.installment.total}</small>}
            {expense.purchase_installment && <small className="recurrence-label"><Repeat2 size={14} />
              Parcela {expense.purchase_installment.number}/{expense.purchase_installment.total} · Compra em {dateLabel(expense.purchase_installment.purchase_on)}
              {' · Total '}{formatMoney(expense.purchase_installment.total_cents, currency)}</small>}
            {expense.credit_mode === 'unica' && <small className="recurrence-label"><CreditCard size={14} />
              {creditLabels[expense.credit_kind]} · Despesa única</small>}
            {expense.advance && <small className="advance-label"><CalendarArrowDown size={14} /> Antecipada
              <span>· Vencimento original em {dateLabel(expense.installment.scheduled_on)} · {formatMoney(expense.installment.scheduled_cents, currency)}</span></small>}
            {expense.kind === 'fixa' && !expense.installment && <small className="recurrence-label"><Repeat2 size={14} /> Fixa
              {expense.closed_on ? ` · Encerramento em ${dateLabel(expense.closed_on)}`
                : expense.ends_on ? ` · Até ${dateLabel(expense.ends_on)}` : ' · Sem prazo'}</small>}
            {expense.tags.length > 0 && <span className="tag-list">{expense.tags.map(tag =>
              <span className="tag-chip" key={tag.id}>{tag.name}</span>)}</span>}
          </div>
          <strong className="expense-amount">{formatMoney(expense.amount_cents, currency)}</strong>
          <div className="tree-actions">
            {expense.can_close && <button className="icon-button close-expense" title="Finalizar despesa fixa"
              aria-label={`Finalizar despesa: ${expense.description || names.get(expense.category_id)}`}
              onClick={() => onCloseExpense(expense)}><CircleStop size={17} /><span>Finalizar</span></button>}
            {expense.can_edit && <button className="icon-button" title="Editar despesa" aria-label={`Editar despesa: ${expense.description || names.get(expense.category_id)}`}
              onClick={() => onEdit(expense)}><Pencil size={17} /></button>}
            {expense.can_delete && <button className="icon-button danger-icon" title="Excluir despesa" aria-label={`Excluir despesa: ${expense.description || names.get(expense.category_id)}`}
              onClick={() => onDelete(expense)}><Trash2 size={17} /></button>}
          </div>
        </li>)}
      </ul>}
    </section>
    {showAdvance && <AdvanceDialog currency={currency} classifications={classifications} onClose={() => setShowAdvance(false)}
      onSaved={(paidOn, count) => {
        setShowAdvance(false)
        setQuery('')
        setTagFilter('')
        setCategoryFilter('')
        setKindFilter('antecipada')
        onAdvanced(paidOn, count)
      }} />}
  </>
}

export function ExpenseDialog({ expense, remove, close, currency, month, horizon, classifications, tags, paymentMethods, onClose, onSaved }) {
  if (close) return <CloseExpenseForm expense={expense} onClose={onClose} onSaved={onSaved} />
  if (remove) {
    const purchase = expense.purchase_installment
    return <DeleteModal title={purchase ? 'Excluir compra parcelada' : 'Excluir despesa'} onClose={onClose}
      onSuccess={() => onSaved(expense, purchase ? 'Compra excluída.' : 'Despesa excluída.')}
      action={() => api(`/expenses/${expense.id}`, 'DELETE')}>
      <p>Excluir {purchase ? 'a compra' : 'a despesa'} de <strong>{formatMoney(purchase?.total_cents ?? expense.amount_cents, currency)}</strong>
        {' de '}{dateLabel(purchase?.purchase_on ?? expense.occurred_on)}?</p>
      <p className="muted">{purchase ? 'Todas as parcelas desta compra serão excluídas.'
        : expense.installment ? 'A exclusão afeta apenas esta parcela.'
          : expense.kind === 'fixa' ? 'A recorrência será retirada dos meses da vigência.'
            : 'O gasto será retirado dos totais e do acompanhamento do teto mensal.'}</p>
    </DeleteModal>
  }
  return <ExpenseForm {...{ expense, currency, month, horizon, classifications, tags, paymentMethods, onClose, onSaved }} />
}

function CloseExpenseForm({ expense, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = localDate()
  const earliest = [expense.starts_on, `${today.slice(0, 7)}-01`].sort().at(-1)

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api(`/expenses/${expense.id}/close`, 'POST', { closed_on: values.get('date') })
      onSaved(expense, 'Despesa fixa finalizada.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Finalizar despesa fixa" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {expense.description && <p className="close-description">{expense.description}</p>}
      <label className="field">Data de encerramento<input name="date" type="date" min={earliest} max="9999-12-31"
        required defaultValue={today < earliest ? earliest : today} /></label>
      <p className="field-note">O mês do encerramento continua no histórico. A despesa deixa de aparecer no mês seguinte.</p>
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Finalizando…' : 'Finalizar despesa'}</button>
      </footer>
    </form>
  </Modal>
}

function ExpenseForm({ expense, currency, month, horizon, classifications, tags, paymentMethods, onClose, onSaved }) {
  const original = expense ? `${expense.department_id}:${expense.category_id}` : ''
  const [category, setCategory] = useState(original)
  const [subcategory, setSubcategory] = useState(String(expense?.subcategory_id ?? ''))
  const [tagIds, setTagIds] = useState(() => new Set(expense?.tags.map(tag => tag.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = localDate()
  const currentMonth = today.slice(0, 7)
  const purchase = expense?.purchase_installment
  const originalDate = expense?.starts_on || purchase?.purchase_on || expense?.occurred_on
  const [kind, setKind] = useState(expense?.kind ?? 'avulsa')
  const [startMode, setStartMode] = useState(originalDate ? 'specific' : 'today')
  const [start, setStart] = useState(originalDate || today)
  const [timed, setTimed] = useState(Boolean(expense?.ends_on))
  const [end, setEnd] = useState(expense?.ends_on ?? '')
  const [financing, setFinancing] = useState(Boolean(expense?.credit_kind))
  const [creditNature, setCreditNature] = useState(expense?.credit_kind || 'financiamento')
  const [creditMode, setCreditMode] = useState(expense?.credit_mode || (expense ? 'unica' : ''))
  const [expenseDate, setExpenseDate] = useState(purchase?.purchase_on ?? expense?.occurred_on ?? (currentMonth === month ? today : ''))
  const [purchaseCount, setPurchaseCount] = useState(purchase?.total?.toString() || '')
  const [paymentId, setPaymentId] = useState(() => paymentMethods.some(method => method.id === expense?.payment_method.id)
    ? String(expense.payment_method.id) : '')
  const installment = expense?.installment
  const startLocked = expense?.kind === 'fixa' && originalDate < `${currentMonth}-01`
  const creditKind = financing ? creditNature : null
  const individual = Boolean(creditKind && creditMode === 'individual')
  const effectiveKind = individual ? 'fixa' : kind
  const fixed = effectiveKind === 'fixa'
  const canSplitPurchase = !financing && !fixed
  const hasTerm = individual || timed
  const effectiveStart = startMode === 'today' ? today : start
  const payment = paymentMethods.find(method => method.id === Number(paymentId))
  const isCard = !financing && payment?.kind === 'credito'
  const dueDay = isCard ? (payment.id === expense?.payment_method.id ? expense.payment_due_day : payment.due_day) : null
  const dueDate = cardDueOn(fixed ? effectiveStart : expenseDate, dueDay)
  const installmentCount = individual && end >= effectiveStart && effectiveStart
    ? (Number(end.slice(0, 4)) - Number(effectiveStart.slice(0, 4))) * 12
      + Number(end.slice(5, 7)) - Number(effectiveStart.slice(5, 7)) + 1
    : 0
  const amountLabel = individual ? 'Valor da parcela' : canSplitPurchase && purchaseCount ? 'Valor total da despesa' : 'Valor da despesa'
  const [departmentId, categoryId] = category.split(':').map(Number)
  const departments = classifications.filter(item => item.level === 1 && item.active)
  const activeCategories = classifications.filter(item => item.level === 2 && item.active)
  const recordedPath = expense && (!departments.some(item => item.id === expense.department_id) ||
    !activeCategories.some(item => item.id === expense.category_id && item.parent_id === expense.department_id))
  const originalSub = classifications.find(item => item.id === expense?.subcategory_id)
  const validSubs = classifications.filter(item => item.level === 3 && item.parent_id === categoryId && item.active)
  const keepOriginalSub = category === original && expense?.subcategory_id &&
    !validSubs.some(item => item.id === expense.subcategory_id)
  const isHistorical = recordedPath && category === original

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const amount = parseMoney(values.get('amount'), amountLabel)
      if (amount <= 0) throw new Error('Informe um valor maior que zero.')
      if (financing && !creditMode) throw new Error('Informe como cadastrar o financiamento.')
      if (!financing && !payment) throw new Error('Selecione a forma de pagamento.')
      if (isCard && !dueDay) throw new Error('Configure o dia de vencimento do cartão em Formas de pagamento.')
      const saved = await api(expense ? `/expenses/${expense.id}` : '/expenses', expense ? 'PUT' : 'POST', {
        amount_cents: amount,
        installment_count: canSplitPurchase && purchaseCount ? Number(purchaseCount) : null,
        kind: effectiveKind,
        occurred_on: installment ? installment.scheduled_on : fixed ? effectiveStart : expenseDate,
        ends_on: fixed && hasTerm && !installment ? end : null,
        credit_kind: installment ? null : creditKind,
        credit_mode: creditKind && !installment ? creditMode : null,
        payment_method_id: financing ? null : payment.id,
        description: values.get('description').trim(),
        department_id: departmentId,
        category_id: categoryId,
        subcategory_id: subcategory ? Number(subcategory) : null,
        tag_ids: [...tagIds],
      })
      if (!expense && individual) {
        const count = saved.installment.total
        onSaved(saved, `${creditLabels[creditKind]} registrado com ${count} ${count === 1 ? 'parcela' : 'parcelas'}.`)
      } else {
        onSaved(saved, installment ? 'Parcela atualizada.' : expense ? 'Despesa atualizada.' : 'Despesa registrada.')
      }
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={expense ? 'Editar despesa' : 'Nova despesa'} onClose={() => { if (!busy) onClose() }}>
    {isCard && (!dueDay || dueDate) && <p className="expense-payment-note" role="status">
      {!dueDay ? 'Configure o vencimento deste cartão em Formas de pagamento.'
        : (canSplitPurchase && Number(purchaseCount) > 1
          ? `Primeira parcela em ${dateLabel(dueDate)}.`
          : `Vencimento previsto em ${dateLabel(dueDate)}.`)}
    </p>}
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <fieldset className="expense-nature" disabled={Boolean(installment)}>
        <legend>Natureza da despesa</legend>
        <div className="expense-toggle">
          <label><input type="radio" name="expense-nature" checked={!financing} onChange={() => setFinancing(false)} />
            <span>Despesa comum</span></label>
          <label><input type="radio" name="expense-nature" checked={financing} onChange={() => setFinancing(true)} />
            <span>Financiamento (empréstimo)</span></label>
        </div>
      </fieldset>
      <div className={canSplitPurchase ? 'fields-two' : undefined}>
        <MoneyInput label={amountLabel} name="amount" currency={currency} cents={purchase?.total_cents ?? expense?.amount_cents} required autoFocus />
        {canSplitPurchase && <label className="field">Número de parcelas
          <input type="number" min="1" step="1" placeholder="Opcional" value={purchaseCount}
            onChange={event => setPurchaseCount(event.target.value)} />
        </label>}
      </div>
      {purchase && <p className="field-note purchase-note">As alterações se aplicam à compra e a todas as parcelas.</p>}
      {financing && !installment && <fieldset className="expense-modality">
        <legend>Modalidade</legend>
        {Object.entries(creditLabels).map(([value, label]) => <label key={value}>
          <input type="radio" name="credit-modality" checked={creditNature === value} onChange={() => setCreditNature(value)} /> {label}
        </label>)}
      </fieldset>}
      {!financing && <label className="field">Forma de pagamento
        <select value={paymentId} required onChange={event => {
          const next = paymentMethods.find(method => method.id === Number(event.target.value))
          setPaymentId(event.target.value)
          if (next?.kind === 'credito' && !expenseDate) setExpenseDate(today)
        }}>
          <option value="">Selecione uma forma de pagamento</option>
          {paymentKinds.map(([kind, label]) => {
            const methods = paymentMethods.filter(method => method.kind === kind)
            return methods.length > 0 && <optgroup label={label} key={kind}>{methods.map(method =>
              <option key={method.id} value={method.id}>{method.name}</option>)}</optgroup>
          })}
        </select>
      </label>}
      {!expense && creditKind && <fieldset className="credit-options">
        <legend>Como cadastrar?</legend>
        <label className="credit-option">
          <input type="radio" name="credit-mode" value="unica" required checked={creditMode === 'unica'}
            onChange={event => setCreditMode(event.target.value)} />
          <span><strong>Despesa única</strong><small>Um registro, avulso ou fixo.</small></span>
        </label>
        <label className="credit-option">
          <input type="radio" name="credit-mode" value="individual" required checked={creditMode === 'individual'}
            onChange={event => setCreditMode(event.target.value)} />
          <span><strong>Parcelas individuais</strong><small>Um registro por mês, com opção de antecipar parcelas.</small></span>
        </label>
      </fieldset>}
      {!installment && (!creditKind || creditMode) && <label className="field">Tipo da despesa
        <select value={effectiveKind} disabled={expense?.kind === 'fixa' || individual} onChange={event => setKind(event.target.value)}>
          <option value="avulsa">Avulsa</option><option value="fixa">Fixa</option>
        </select>
      </label>}
      {installment ? <div className="field installment-info">
        <p>{creditLabels[installment.kind]} · Parcela {installment.number}/{installment.total}</p>
        <small>Vencimento em {dateLabel(installment.scheduled_on)}. As alterações se aplicam apenas a esta parcela.</small>
      </div> : creditKind && !creditMode ? null : fixed ? <fieldset className="recurring-fields">
        <legend><Repeat2 size={16} /> Recorrência mensal</legend>
        <div className="fields-two">
          {startLocked ? <label className="field">Data de início<input type="date" value={start} readOnly /></label>
            : <label className="field">Início<select value={startMode} onChange={event => setStartMode(event.target.value)}>
              <option value="today">A partir de hoje</option><option value="specific">Data específica</option>
            </select></label>}
          <label className="field">Prazo<select value={hasTerm ? 'timed' : 'open'} disabled={individual}
            onChange={event => setTimed(event.target.value === 'timed')}>
            <option value="open">Sem prazo</option><option value="timed">Com prazo</option>
          </select></label>
        </div>
        {!startLocked && startMode === 'specific' && <label className="field">Data de início
          <input type="date" min={expense?.kind === 'fixa' ? `${currentMonth}-01` : '1900-01-01'} max={horizon}
            required value={start} onChange={event => setStart(event.target.value)} /></label>}
        {!startLocked && startMode === 'today' && <p className="field-note recurrence-note">Início em {dateLabel(today)}.</p>}
        {hasTerm && <label className="field">Data de término<input type="date"
          min={startLocked ? `${currentMonth}-01` : effectiveStart || '1900-01-01'} max="9999-12-31"
          required value={end} onChange={event => setEnd(event.target.value)} /></label>}
        {individual && <p className="field-note">{installmentCount
          ? `Serão criadas ${installmentCount} ${installmentCount === 1 ? 'parcela individual' : 'parcelas individuais'}, uma por mês da vigência.`
          : 'O valor informado será aplicado a cada parcela.'}</p>}
        {startLocked && <p className="field-note">As alterações passam a valer a partir do mês atual.</p>}
      </fieldset> : <label className="field">{isCard ? 'Data da compra' : 'Data da despesa'}
        <input type="date" required min="1900-01-01" max="9999-12-31" value={expenseDate}
          onChange={event => setExpenseDate(event.target.value)} />
      </label>}
      {!isCard && canSplitPurchase && Number(purchaseCount) > 1 && expenseDate && <p className="field-note purchase-note">
        Primeira parcela em {dateLabel(expenseDate)}.
      </p>}
      <label className="field">Categoria
        <select value={category} required onChange={event => {
          setCategory(event.target.value)
          setSubcategory(event.target.value === original ? String(expense?.subcategory_id ?? '') : '')
        }}>
          <option value="">Selecione uma categoria</option>
          {recordedPath && <option value={original}>
            {classifications.find(item => item.id === expense.department_id)?.name} / {classifications.find(item => item.id === expense.category_id)?.name} (registro original)
          </option>}
          {departments.map(department => {
            const children = activeCategories.filter(item => item.parent_id === department.id)
            return children.length > 0 && <optgroup label={department.name} key={department.id}>
              {children.map(item => <option key={item.id} value={`${department.id}:${item.id}`}>{item.name}</option>)}
            </optgroup>
          })}
        </select>
      </label>
      {(validSubs.length > 0 || keepOriginalSub || (isHistorical && originalSub)) && <label className="field">Subcategoria (opcional)
        <select value={subcategory} disabled={Boolean(isHistorical)} onChange={event => setSubcategory(event.target.value)}>
          <option value="">Sem subcategoria</option>
          {keepOriginalSub && <option value={expense.subcategory_id}>{originalSub?.name} (registro original)</option>}
          {validSubs.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      <label className="field">Descrição (opcional)<input name="description" maxLength={500} placeholder="Ex. Compra da semana"
        defaultValue={expense?.description} /></label>
      <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} />
      <footer className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy || (isCard && !dueDay)}>{busy ? 'Salvando…' : 'Salvar despesa'}</button>
      </footer>
    </form>
  </Modal>
}
