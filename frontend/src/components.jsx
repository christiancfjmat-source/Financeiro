import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Tags, X } from 'lucide-react'
import { addMonthsToDate, amountInput, parseMoney } from './finance'

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

const firstMonth = '1900-01'
const lastMonth = '9999-12'
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })
const monthNames = Array.from({ length: 12 }, (_, index) =>
  monthName.format(new Date(Date.UTC(2000, index, 1))))

function MonthInput({ month, setMonth, label }) {
  return <input type="month" aria-label={label} value={month} min={firstMonth} max={lastMonth}
    onChange={event => { if (event.target.value && event.target.validity.valid) setMonth(event.target.value) }} />
}

export function MonthPicker({ month, setMonth, label = 'Mês de referência' }) {
  return <label className="period"><CalendarDays size={18} />
    <MonthInput month={month} setMonth={setMonth} label={label} />
  </label>
}

export function usePickerPopover() {
  const [open, setOpen] = useState(false)
  const container = useRef(null)
  const trigger = useRef(null)
  const id = useId()

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    function dismissOutside(event) {
      if (!container.current?.contains(event.target)) setOpen(false)
    }
    function dismissOnEscape(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    document.addEventListener('keydown', dismissOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      document.removeEventListener('keydown', dismissOnEscape)
    }
  }, [open])
  return { open, setOpen, close, container, trigger, id }
}

export function CalendarMonthPicker({ month, setMonth }) {
  const { open, setOpen, close, container, trigger, id } = usePickerPopover()
  const [year, setYear] = useState(() => Number(month.slice(0, 4)))

  function changeMonth(value) {
    setOpen(false)
    setMonth(value)
  }

  function stepMonth(offset) {
    changeMonth(addMonthsToDate(`${month}-01`, offset).slice(0, 7))
  }

  return <div className="period calendar-period" ref={container}>
    <button type="button" className="icon-button" aria-label="Mês anterior" title="Mês anterior"
      disabled={month <= firstMonth} onClick={() => stepMonth(-1)}><ChevronLeft size={18} /></button>
    <button type="button" className="icon-button calendar-trigger" ref={trigger} aria-label="Calendário de meses"
      title="Calendário de meses" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        setYear(Number(month.slice(0, 4)))
        setOpen(!open)
      }}><CalendarDays size={18} /></button>
    <MonthInput month={month} setMonth={changeMonth} label="Mês de referência" />
    <button type="button" className="icon-button" aria-label="Próximo mês" title="Próximo mês"
      disabled={month >= lastMonth} onClick={() => stepMonth(1)}><ChevronRight size={18} /></button>
    {open && <div className="picker-popover month-calendar" id={id} role="group" aria-label="Escolher mês">
      <div className="calendar-year">
        <button type="button" className="icon-button" aria-label="Ano anterior" title="Ano anterior"
          disabled={year <= 1900} onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
        <strong aria-live="polite">{year}</strong>
        <button type="button" className="icon-button" aria-label="Próximo ano" title="Próximo ano"
          disabled={year >= 9999} onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
      </div>
      <div className="calendar-months">{monthNames.map((name, index) => {
        const value = `${year}-${String(index + 1).padStart(2, '0')}`
        return <button type="button" key={name} aria-pressed={month === value} onClick={() => {
          setMonth(value)
          close()
        }}>{name}</button>
      })}</div>
    </div>}
  </div>
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
