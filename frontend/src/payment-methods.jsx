import { useState } from 'react'
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from './api'
import { DeleteModal, ErrorNotice, Modal } from './components'

export const paymentKinds = [
  ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ['pix', 'Pix'], ['boleto', 'Boleto'],
  ['debito_automatico', 'Débito automático'], ['transferencia', 'Transferência'], ['dinheiro', 'Dinheiro'], ['outro', 'Outros'],
]

export function PaymentMethodsPage({ methods, refresh, notify }) {
  const [modal, setModal] = useState(null)
  const close = () => setModal(null)

  async function complete(message) {
    close()
    await refresh()
    notify(message)
  }

  return <>
    <section className="page-heading">
      <div><h1>Formas de pagamento</h1><p>Cadastre seus métodos e configure o vencimento de cada cartão de crédito.</p></div>
      <button className="button primary" onClick={() => setModal({})}><Plus size={18} /> Nova forma de pagamento</button>
    </section>
    {methods.length === 0 && <p className="empty">Nenhuma forma cadastrada.</p>}
    <div className="payment-groups">
      {paymentKinds.map(([kind, label]) => {
        const group = methods.filter(method => method.kind === kind)
        return group.length > 0 && <section className="panel payment-group" key={kind}>
          <h2>{label}</h2>
          <ul>{group.map(method => <li key={method.id}>
            <span className="tree-icon"><CreditCard size={17} aria-hidden="true" /></span>
            <div className="tree-name">
              <strong>{method.name}</strong>
              {kind === 'credito' && <small>{method.due_day ? `Vencimento no dia ${method.due_day}` : 'Vencimento a configurar'}</small>}
            </div>
            <div className="tree-actions">
              <button className="icon-button" aria-label={`Editar ${method.name}`} onClick={() => setModal({ method })}><Pencil size={16} /></button>
              <button className="icon-button danger-icon" aria-label={`Excluir ${method.name}`}
                onClick={() => setModal({ method, remove: true })}><Trash2 size={16} /></button>
            </div>
          </li>)}</ul>
        </section>
      })}
    </div>
    {modal?.remove && <DeleteModal title="Excluir forma de pagamento" onClose={close}
      action={() => api(`/payment-methods/${modal.method.id}`, 'DELETE')}
      onSuccess={() => complete('Forma de pagamento excluída.')}>
      <p>Excluir <strong>{modal.method.name}</strong>?</p>
    </DeleteModal>}
    {modal && !modal.remove && <PaymentForm method={modal.method} onClose={close}
      onSave={() => complete('Forma de pagamento salva.')} />}
  </>
}

function PaymentForm({ method, onClose, onSave }) {
  const [kind, setKind] = useState(method?.kind || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await api(method ? `/payment-methods/${method.id}` : '/payment-methods', method ? 'PUT' : 'POST', {
        name: values.get('name').trim(),
        kind,
        due_day: kind === 'credito' ? Number(values.get('due_day')) : null,
      })
      await onSave()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={method ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <label className="field">Nome da forma de pagamento<input name="name" maxLength={80} defaultValue={method?.name}
        placeholder="Ex. Cartão de crédito 1" autoFocus required /></label>
      <label className="field">Categoria da forma de pagamento
        <select value={kind} required onChange={event => setKind(event.target.value)}>
          <option value="">Selecione</option>
          {paymentKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {kind === 'credito' && <label className="field">Dia de vencimento<input name="due_day" type="number" min="1" max="31"
        step="1" defaultValue={method?.due_day || ''} required /></label>}
      <footer className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar forma de pagamento'}</button>
      </footer>
    </form>
  </Modal>
}
