import { useState } from 'react'
import { Banknote, CircleStop, Pencil, Plus, Repeat2, Trash2 } from 'lucide-react'
import { api } from './api'
import { DeleteModal, ErrorNotice, Modal, MoneyInput, MonthPicker, TagPicker } from './components'
import { addMonthsToDate, dateLabel, formatMoney, localDate, parseMoney } from './finance'
import { useMonthData } from './month-data'

export function IncomeCredits({ month, setMonth, horizon, tags, currency, notify }) {
  const { data, error, reload } = useMonthData('/income', month)
  const [modal, setModal] = useState(null)
  const close = () => setModal(null)

  function complete(message, reference) {
    if (reference) setMonth(reference)
    close()
    reload()
    notify(message)
  }

  return <section className="panel revision-panel" aria-label="Créditos">
    <div className="panel-heading income-heading">
      <div><h2>Créditos</h2><p>Créditos avulsos e fixos da renda do mês</p></div>
      <div className="heading-actions">
        <MonthPicker month={month} setMonth={setMonth} label="Mês dos créditos" />
        <button className="button secondary compact" onClick={() => setModal({})}><Plus size={17} /> Novo crédito</button>
      </div>
    </div>
    {error && <><ErrorNotice message={error} /><button className="button secondary compact" onClick={reload}>Tentar novamente</button></>}
    {!data && !error && <p className="empty" role="status">Carregando créditos…</p>}
    {data?.unassigned.length > 0 && <p className="field-note">Defina o mês dos créditos sem competência para incluí-los na renda.</p>}
    {data?.credits.length === 0 && <p className="empty">Nenhum crédito cadastrado para este mês.</p>}
    {data && <ul className="revision-list income-list">{[...data.unassigned, ...data.credits].map(credit => {
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
    {modal?.remove && <DeleteModal title="Excluir crédito" onClose={close}
      action={() => api(`/income/credits/${modal.credit.id}`, 'DELETE')} onSuccess={() => complete('Crédito excluído.')}>
      <p>Excluir o crédito de <strong>{formatMoney(modal.credit.amount_cents, currency)}</strong>?</p>
    </DeleteModal>}
    {modal?.close && <CloseCreditForm credit={modal.credit} onClose={close} onSave={() => complete('Crédito fixo finalizado.')} />}
    {modal && !modal.remove && !modal.close && <CreditForm credit={modal.credit} month={month} horizon={horizon}
      tags={tags} currency={currency} onClose={close} onSave={reference => complete('Crédito salvo.', reference)} />}
  </section>
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
