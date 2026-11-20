import { useState } from 'react'
import { Banknote, CircleStop, Pencil, Plus, Repeat2, Search, Trash2 } from 'lucide-react'
import { api } from './api'
import { DeleteModal, ErrorNotice, Modal, MoneyInput, MonthPicker, TagPicker } from './components'
import { addMonthsToDate, dateLabel, formatMoney, localDate, parseMoney } from './finance'
import { useMonthData } from './month-data'

const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

export function CreditsPage({ month, setMonth, horizon, tags, currency, notify }) {
  const { data, error, reload } = useMonthData('/income', month)
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('')
  const [tag, setTag] = useState('')
  const close = () => setModal(null)
  const search = normalize(query.trim())
  const credits = data && [...data.unassigned, ...data.credits].filter(credit => {
    const labels = [credit.description, creditDetails(credit), ...credit.tags.map(item => item.name)]
    return (!kind || credit.kind === kind) &&
      (!tag || credit.tags.some(item => item.id === Number(tag))) &&
      normalize(labels.join(' ')).includes(search)
  })
  const total = credits?.reduce((sum, credit) => sum + (credit.month ? credit.amount_cents : 0), 0)

  function complete(message, reference) {
    if (reference) setMonth(reference)
    close()
    reload()
    notify(message)
  }

  return <>
    <section className="page-heading">
      <div><h1>Créditos</h1><p>Consulte e cadastre créditos avulsos e fixos.</p></div>
      <div className="heading-actions">
        <MonthPicker month={month} setMonth={setMonth} label="Mês dos créditos" />
        <button className="button primary" onClick={() => setModal({})}><Plus size={18} /> Novo crédito</button>
      </div>
    </section>
    <section className="panel" aria-label="Lançamentos de crédito">
      <div className="filter-row">
        <label className="search"><Search size={18} /><input type="search" aria-label="Buscar créditos" placeholder="Buscar lançamentos"
          value={query} onChange={event => setQuery(event.target.value)} /></label>
        <select aria-label="Filtrar créditos por tipo" value={kind} onChange={event => setKind(event.target.value)}>
          <option value="">Todos os tipos</option><option value="avulso">Avulsos</option><option value="fixo">Fixos</option>
        </select>
        <select aria-label="Filtrar créditos por tag" value={tag} onChange={event => setTag(event.target.value)}>
          <option value="">Todas as tags</option>
          {tags.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      {error && <div className="inset"><ErrorNotice message={error} />
        <button className="button secondary compact" onClick={reload}>Tentar novamente</button></div>}
      {!data && !error && <p className="empty" role="status">Carregando créditos…</p>}
      {credits && <div className="expense-summary">
        <span>{credits.length} {credits.length === 1 ? 'crédito exibido' : 'créditos exibidos'}</span>
        <strong>{formatMoney(total, currency)}</strong>
      </div>}
      {credits?.some(credit => !credit.month) && <p className="field-note inset">Defina o mês dos créditos sem competência para incluí-los na renda.</p>}
      {credits?.length === 0 && <p className="empty">
        {data.credits.length || data.unassigned.length
          ? 'Nenhum crédito corresponde aos filtros.'
          : 'Nenhum crédito cadastrado para este mês.'}</p>}
      {credits?.length > 0 && <ul className="revision-list income-list">{credits.map(credit => {
        const name = credit.description || (credit.kind === 'fixo' ? 'Crédito fixo' : 'Crédito avulso')
        return <li key={credit.id}>
          {credit.kind === 'fixo' ? <Repeat2 size={18} /> : <Banknote size={18} />}
          <div className="income-entry">
            <p>{name}</p>
            <small className="muted">{creditDetails(credit)}</small>
            {credit.tags.length > 0 && <span className="tag-list">{credit.tags.map(tag =>
              <span className="tag-chip" key={tag.id}>{tag.name}</span>)}</span>}
          </div>
          <strong>{formatMoney(credit.amount_cents, currency)}</strong>
          {(credit.can_edit || credit.can_delete || credit.can_close) && <div className="tree-actions">
            {credit.can_close && <button className="icon-button close-expense" title="Finalizar crédito fixo" aria-label={`Finalizar ${name}`}
              onClick={() => setModal({ credit, close: true })}><CircleStop size={17} /><span>Finalizar</span></button>}
            {credit.can_edit && <button className="icon-button" aria-label={`${credit.month ? 'Editar' : 'Definir mês de'} ${name}`}
              onClick={() => setModal({ credit })}><Pencil size={17} /></button>}
            {credit.can_delete && <button className="icon-button danger-icon" aria-label={`Excluir ${name}`}
              onClick={() => setModal({ credit, remove: true })}><Trash2 size={17} /></button>}
          </div>}
        </li>
      })}</ul>}
    </section>
    {modal?.remove && <DeleteModal title="Excluir crédito" onClose={close}
      action={() => api(`/income/credits/${modal.credit.id}`, 'DELETE')} onSuccess={() => complete('Crédito excluído.')}>
      <p>Excluir o crédito de <strong>{formatMoney(modal.credit.amount_cents, currency)}</strong>?</p>
    </DeleteModal>}
    {modal?.close && <CloseCreditForm credit={modal.credit} onClose={close} onSave={() => complete('Crédito fixo finalizado.')} />}
    {modal && !modal.remove && !modal.close && <CreditForm credit={modal.credit} month={month} horizon={horizon}
      tags={tags} currency={currency} onClose={close} onSave={reference => complete('Crédito salvo.', reference)} />}
  </>
}

function creditDetails(credit) {
  if (!credit.month) return 'Sem competência'
  if (credit.kind === 'avulso') return credit.occurred_on ? `Avulso · ${dateLabel(credit.occurred_on)}` : 'Avulso'
  if (credit.closed_on) return `Fixo · Encerramento em ${dateLabel(credit.closed_on)}`
  if (credit.ends_on) return `Fixo · Até ${dateLabel(credit.ends_on)}`
  return 'Fixo · Sem prazo'
}

export function CreditForm({ credit, month, horizon, tags, currency, onClose, onSave }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = localDate()
  const currentMonth = today.slice(0, 7)
  const [kind, setKind] = useState(credit?.kind || 'avulso')
  const [creditMonth, setCreditMonth] = useState(credit?.month?.slice(0, 7) || month)
  const [creditDate, setCreditDate] = useState(credit?.kind === 'avulso' ? credit.occurred_on || '' : '')
  const [startMode, setStartMode] = useState(credit?.starts_on ? 'specific' : 'today')
  const [start, setStart] = useState(credit?.starts_on || today)
  const [hasTerm, setHasTerm] = useState(Boolean(credit?.ends_on))
  const [end, setEnd] = useState(credit?.ends_on || '')
  const [tagIds, setTagIds] = useState(() => new Set(credit?.tags.map(tag => tag.id)))
  const fixed = kind === 'fixo'
  const startLocked = credit?.kind === 'fixo' && credit.starts_on < `${currentMonth}-01`
  const effectiveStart = startMode === 'today' ? today : start

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const amount = parseMoney(values.get('amount'), 'Valor do crédito')
      if (amount <= 0) throw new Error('Informe um valor maior que zero.')
      const saved = await api(credit ? `/income/credits/${credit.id}` : '/income/credits', credit ? 'PUT' : 'POST', {
        kind,
        month: fixed ? null : `${creditMonth}-01`,
        occurred_on: fixed ? effectiveStart : creditDate || null,
        ends_on: fixed && hasTerm ? end : null,
        description: values.get('description').trim(),
        amount_cents: amount,
        tag_ids: [...tagIds],
      })
      const firstMonth = saved.month.slice(0, 7)
      const lastDay = saved.ends_on && saved.ends_on < horizon ? saved.ends_on : horizon
      onSave(!fixed || month < firstMonth || month > lastDay.slice(0, 7) ? firstMonth : month)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={credit ? 'Editar crédito' : 'Novo crédito'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <div className="fields-two">
        <MoneyInput label="Valor do crédito" name="amount" currency={currency} cents={credit?.amount_cents} required autoFocus />
        <label className="field">Tipo do crédito<select value={kind} disabled={credit?.kind === 'fixo'} onChange={event => setKind(event.target.value)}>
          <option value="avulso">Avulso</option><option value="fixo">Fixo</option>
        </select></label>
      </div>
      {fixed ? <fieldset className="recurring-fields">
        <legend><Repeat2 size={16} /> Recorrência mensal</legend>
        <div className="fields-two">
          {startLocked ? <label className="field">Data de início<input type="date" value={start} readOnly /></label>
            : <label className="field">Início<select value={startMode} onChange={event => setStartMode(event.target.value)}>
              <option value="today">A partir de hoje</option><option value="specific">Data específica</option>
            </select></label>}
          <label className="field">Prazo<select value={hasTerm ? 'timed' : 'open'} onChange={event => setHasTerm(event.target.value === 'timed')}>
            <option value="open">Sem prazo</option><option value="timed">Com prazo</option>
          </select></label>
        </div>
        {!startLocked && startMode === 'specific' && <label className="field">Data de início
          <input type="date" min={credit?.kind === 'fixo' ? `${currentMonth}-01` : '1900-01-01'} max={horizon}
            required value={start} onChange={event => setStart(event.target.value)} /></label>}
        {!startLocked && startMode === 'today' && <p className="field-note recurrence-note">Início em {dateLabel(today)}.</p>}
        {hasTerm && <label className="field">Data de término<input type="date"
          min={startLocked ? `${currentMonth}-01` : effectiveStart || '1900-01-01'} max="9999-12-31"
          required value={end} onChange={event => setEnd(event.target.value)} /></label>}
        {startLocked && <p className="field-note">As alterações passam a valer a partir do mês atual.</p>}
      </fieldset> : <div className="fields-two">
        <label className="field">Mês do crédito<input type="month" min="1900-01" max="9999-12"
          value={creditMonth} onChange={event => {
            setCreditMonth(event.target.value)
            if (creditDate.slice(0, 7) !== event.target.value) setCreditDate('')
          }} required /></label>
        <label className="field">Data do crédito (opcional)<input type="date" value={creditDate} disabled={!creditMonth}
          min={creditMonth ? `${creditMonth}-01` : undefined}
          max={creditMonth ? addMonthsToDate(`${creditMonth}-31`, 0) : undefined}
          onChange={event => setCreditDate(event.target.value)} /></label>
      </div>}
      <label className="field">Descrição (opcional)<input name="description" maxLength={160} defaultValue={credit?.description} /></label>
      <TagPicker tags={tags} selected={tagIds} onChange={setTagIds} />
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar crédito'}</button>
      </footer>
    </form>
  </Modal>
}

function CloseCreditForm({ credit, onClose, onSave }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const today = localDate()
  const earliest = [credit.starts_on, `${today.slice(0, 7)}-01`].sort().at(-1)

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api(`/income/credits/${credit.id}/close`, 'POST', { closed_on: values.get('date') })
      onSave()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Finalizar crédito fixo" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {credit.description && <p className="close-description">{credit.description}</p>}
      <label className="field">Data de encerramento<input name="date" type="date" min={earliest} max="9999-12-31"
        required defaultValue={today < earliest ? earliest : today} /></label>
      <p className="field-note">O último crédito será o do mês de encerramento.</p>
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Finalizando…' : 'Finalizar crédito'}</button>
      </footer>
    </form>
  </Modal>
}
