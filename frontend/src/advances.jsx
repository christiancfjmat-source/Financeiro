import { useEffect, useState } from 'react'
import { CalendarArrowDown } from 'lucide-react'
import { api } from './api'
import { ErrorNotice, Modal, MoneyInput } from './components'
import { dateLabel, formatMoney, localDate, parseMoney } from './finance'

export const creditLabels = { emprestimo: 'Empréstimo', financiamento: 'Financiamento' }

export function AdvanceDialog({ currency, classifications, onClose, onSaved }) {
  const today = localDate()
  const [paidOn, setPaidOn] = useState(today)
  const [state, setState] = useState(null)
  const [agreementId, setAgreementId] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const validDate = Boolean(paidOn && paidOn >= '1900-01-01' && paidOn <= today)

  useEffect(() => {
    if (!validDate) return
    const controller = new AbortController()
    api(`/installment-advances/options?paid_on=${paidOn}`, 'GET', undefined, controller.signal)
      .then(options => { if (!controller.signal.aborted) setState({ paidOn, options }) })
      .catch(failure => { if (!controller.signal.aborted) setState({ paidOn, error: failure.message }) })
    return () => controller.abort()
  }, [paidOn, validDate])

  const result = validDate && state?.paidOn === paidOn ? state : null
  const groups = new Map()
  for (const option of result?.options || []) {
    const id = String(option.installment.agreement_id)
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(option)
  }
  const currentAgreement = agreementId || groups.keys().next().value || ''

  function chooseDate(value) {
    if (value === paidOn) return
    setState(null)
    setSelected(new Set())
    setAgreementId('')
    setError('')
    setPaidOn(value)
  }

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      const installments = [...selected].map(expense_id => {
        const paid_cents = parseMoney(values.get(`paid-${expense_id}`), 'Valor pago')
        if (paid_cents <= 0) throw new Error('Informe um valor maior que zero para cada parcela.')
        return { expense_id, paid_cents }
      })
      await api('/installment-advances', 'POST', { paid_on: paidOn, installments })
      onSaved(paidOn, installments.length)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Antecipar parcelas" onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error || result?.error} />
      <label className="field">Data do pagamento<input type="date" min="1900-01-01" max={today}
        required value={paidOn} disabled={busy} onChange={event => chooseDate(event.target.value)} /></label>
      <p className="field-note">Selecione as parcelas que vencem depois do mês do pagamento e informe quanto você pagou por cada uma.</p>
      {validDate && !result && <p className="empty" role="status">Carregando parcelas…</p>}
      {result?.options?.length === 0 && <p className="empty">Nenhuma parcela disponível para esta data.</p>}
      {groups.size > 0 && <>
        <label className="field advance-agreement">Contrato<select value={currentAgreement} disabled={busy}
          onChange={event => { setAgreementId(event.target.value); setSelected(new Set()); setError('') }}>
          {[...groups].map(([id, [first]]) => {
            const { kind, agreement_description } = first.installment
            const description = agreement_description || classifications.find(item => item.id === first.category_id)?.name
            return <option key={id} value={id}>{creditLabels[kind]} · {description} · Contrato {id}</option>
          })}
        </select></label>
        <ul className="advance-options" aria-label="Parcelas disponíveis">
          {groups.get(currentAgreement)?.map(({ expense_id, installment }) =>
            <li key={expense_id} className="advance-option">
              <label className="advance-choice">
                <input type="checkbox" checked={selected.has(expense_id)} disabled={busy} onChange={event => {
                  const next = new Set(selected)
                  if (event.target.checked) next.add(expense_id)
                  else next.delete(expense_id)
                  setSelected(next)
                }} />
                <span><strong>Parcela {installment.number}/{installment.total}</strong>
                  <small>{dateLabel(installment.scheduled_on)} · {formatMoney(installment.scheduled_cents, currency)}</small>
                </span>
              </label>
              {selected.has(expense_id) && <MoneyInput label={`Valor pago pela parcela ${installment.number}`}
                name={`paid-${expense_id}`} cents={installment.scheduled_cents} currency={currency} required />}
            </li>)}
        </ul>
      </>}
      <footer className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy || !selected.size}>
          <CalendarArrowDown size={17} />{busy ? 'Salvando…' : 'Registrar antecipação'}
        </button>
      </footer>
    </form>
  </Modal>
}
