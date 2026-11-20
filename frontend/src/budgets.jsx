import { useEffect, useState } from 'react'
import { api } from './api'
import { DeleteModal, ErrorNotice, Modal, MoneyInput } from './components'
import { budgetPercent, formatMoney, monthLabel, parseMoney } from './finance'

export function BudgetUsage({ budget, settings }) {
  const { spent_cents: spent, limit_cents: limit, available_cents: available } = budget
  const money = value => formatMoney(value, settings.currency)
  const used = budgetPercent(spent, limit)
  const fill = available <= 0 ? 100 : Number(used)
  let tone = 'healthy'
  let status = ''
  if (available < 0) {
    tone = 'over'
    status = 'Excedido'
  } else if (available === 0 || used >= settings.alert_limit) {
    tone = 'over'
    status = available === 0 ? 'Teto atingido' : 'Limite de alerta'
  } else if (used >= settings.alert_near) {
    tone = 'warning'
    status = 'Próximo do teto'
  } else if (used >= settings.alert_attention) {
    tone = 'warning'
    status = 'Atenção'
  }

  return <div className={`budget-usage ${tone}`}>
    <div className="budget-values"><span><strong>{money(spent)}</strong> de {money(limit)}</span>
      <span>{used === null ? 'Teto zero' : `${used}%`}</span></div>
    <div className="usage-track" role="meter" aria-label="Teto utilizado" aria-valuenow={fill}
      aria-valuemin={0} aria-valuemax={100} aria-valuetext={used === null ? 'Teto zero' : `${used}%`}>
      <span style={{ width: `${fill}%` }} />
    </div>
    <div className="budget-values budget-caption">
      <span>{available < 0 ? `${money(-available)} acima do teto` : `${money(available)} disponível`}</span>
      {status && <strong>{status}</strong>}
    </div>
  </div>
}

export function BudgetDialog({ category, settings, onClose, onSaved }) {
  const [budget, setBudget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = `/budgets/${category.id}`
  const reference = budget && monthLabel(budget.month)
  const savePath = budget && `${path}?month=${budget.month}`

  useEffect(() => {
    const controller = new AbortController()
    api(path, 'GET', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setBudget(data) })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [path])

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const limit = parseMoney(values.get('limit'), 'Teto mensal')
      await api(savePath, 'PUT', { limit_cents: limit })
      onSaved('Teto mensal salvo.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (removing) return <DeleteModal title="Excluir teto mensal" onClose={onClose}
    action={() => api(savePath, 'DELETE')} onSuccess={() => onSaved('Teto mensal excluído.')}>
    <p>Excluir o teto de <strong>{category.name}</strong> de {reference} em diante?</p>
  </DeleteModal>

  return <Modal title={`Teto mensal · ${category.name}`} onClose={() => { if (!busy) onClose() }}>
    <ErrorNotice message={error} />
    {!budget && !error && <p role="status">Carregando teto…</p>}
    {budget && <form onSubmit={submit}>
      <p className="budget-reference">Vigência a partir de {reference}</p>
      <MoneyInput label="Valor do teto mensal" name="limit" currency={settings.currency}
        cents={budget.limit_cents} autoFocus required />
      <p className="field-note">O valor vale para todos os meses a partir do mês atual. O histórico dos meses anteriores é preservado.</p>
      <footer className="dialog-actions budget-actions">
        {budget.limit_cents !== null && <button className="button text-danger" type="button" disabled={busy} onClick={() => setRemoving(true)}>Excluir teto</button>}
        <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar teto'}</button>
      </footer>
    </form>}
  </Modal>
}
