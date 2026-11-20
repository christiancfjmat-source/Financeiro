import { useState } from 'react'
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

export function BudgetDialog({ category, budget, used, settings, month, onClose, onSaved }) {
  const [removing, setRemoving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = `/budgets/${category.id}?month=${month}`
  const reference = monthLabel(month)

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const limit = parseMoney(values.get('limit'), 'Teto mensal')
      await api(path, 'PUT', { limit_cents: limit })
      onSaved('Teto mensal salvo.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (removing) return <DeleteModal title="Excluir teto mensal" onClose={onClose}
    action={() => api(path, 'DELETE')} onSuccess={() => onSaved('Teto mensal excluído.')}>
    <p>Excluir o teto de <strong>{category.name}</strong> para {reference}?</p>
  </DeleteModal>

  return <Modal title={`Teto mensal · ${category.name}`} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <p className="budget-reference">{reference} · {formatMoney(used, settings.currency)} gastos</p>
      <MoneyInput label="Valor do teto mensal" name="limit" currency={settings.currency}
        cents={budget?.limit_cents} autoFocus required />
      <p className="field-note">O teto vale para o mês selecionado e inclui os gastos das subcategorias.</p>
      <footer className="dialog-actions budget-actions">
        {budget && <button className="button text-danger" type="button" disabled={busy} onClick={() => setRemoving(true)}>Excluir teto</button>}
        <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="button primary" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar teto'}</button>
      </footer>
    </form>
  </Modal>
}
