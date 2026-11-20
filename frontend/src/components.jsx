import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, Tags, X } from 'lucide-react'
import { amountInput, parseMoney } from './finance'

export function ErrorNotice({ message }) {
  return message && <div className="error" role="alert"><AlertCircle size={18} />{message}</div>
}

export function TagPicker({ tags, selected, onChange }) {
  return <fieldset className="tag-picker">
    <legend><Tags size={15} /> Tags (opcional)</legend>
    {tags.length > 0 ? <div className="tag-options">{tags.map(tag => <label className="tag-option" key={tag.id}>
      <input type="checkbox" checked={selected.has(tag.id)} onChange={event => {
        const next = new Set(selected)
        if (event.target.checked) next.add(tag.id)
        else next.delete(tag.id)
        onChange(next)
      }} />
      {tag.name}
    </label>)}</div> : <p className="field-note">Cadastre suas tags na página Tags.</p>}
  </fieldset>
}

export function Modal({ title, onClose, children }) {
  const dialog = useRef(null)
  const heading = useId()
  useEffect(() => {
    dialog.current.showModal()
  }, [])
  return <dialog className="modal" ref={dialog} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id={heading}>{title}</h2>
      <button type="button" className="icon-button" aria-label="Fechar janela" onClick={onClose}><X size={20} /></button>
    </header>
    {children}
  </dialog>
}

export function MonthPicker({ month, setMonth, label = 'Mês de referência' }) {
  return <label className="period"><CalendarDays size={18} />
    <input type="month" aria-label={label} value={month} min="1900-01" max="9999-12"
      onChange={event => { if (event.target.value && event.target.validity.valid) setMonth(event.target.value) }} />
  </label>
}

export function DeleteModal({ title, children, action, onClose, onSuccess }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await action()
      onSuccess()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={title} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {children}
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button danger" disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</button>
      </footer>
    </form>
  </Modal>
}

export function MoneyInput({ label, name, cents, currency, required, signed = false, autoFocus = false }) {
  const [value, setValue] = useState(() => amountInput(cents))
  return <label className="field">{label}
    <div className="money-input">
      <span aria-hidden="true">{currency === 'BRL' ? 'R$' : currency === 'USD' ? 'US$' : '€'}</span>
      <input aria-label={label} name={name} inputMode={signed ? 'text' : 'decimal'}
        value={value} required={required} autoFocus={autoFocus} placeholder="0,00" maxLength={20}
        onChange={event => setValue(event.target.value.replace(/[^\d,.-]/g, ''))}
        onBlur={() => {
          if (!value) return
          try { setValue(amountInput(parseMoney(value, label, { signed }))) }
          catch { /* Preserve the text so the user can correct the amount. */ }
        }} />
    </div>
  </label>
}
