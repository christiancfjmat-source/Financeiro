const maxCents = 999_999_999_999

export function parseMoney(value, label, { optional = false, signed = false } = {}) {
  const text = value.trim()
  if (!text && optional) return null
  const match = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text)
  if (!match || (match[1] && !signed)) {
    throw new Error(`${label}: informe um valor como 1.234,56.`)
  }
  const digits = match[2].replaceAll('.', '') + (match[3] || '').padEnd(2, '0')
  const cents = Number(digits)
  if (!Number.isSafeInteger(cents) || cents > maxCents) {
    throw new Error(`${label}: o valor excede o limite permitido.`)
  }
  return match[1] && cents ? -cents : cents
}

export function amountInput(cents) {
  if (cents == null) return ''
  const digits = String(Math.abs(cents)).padStart(3, '0')
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${cents < 0 ? '-' : ''}${whole},${digits.slice(-2)}`
}

export function formatMoney(cents, currency) {
  if (cents == null) return '—'
  const sign = cents < 0 ? '−' : ''
  const integer = BigInt(Math.abs(cents)) / 100n
  const fraction = String(BigInt(Math.abs(cents)) % 100n).padStart(2, '0')
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency })
    .formatToParts(integer)
    .map(part => part.type === 'fraction' ? fraction : part.value)
    .join('')
    .replace(/^/, sign)
}

export function localDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-')
}

export function localMonth(now = new Date()) {
  return localDate(now).slice(0, 7)
}

export function dateLabel(value) {
  return value.split('-').reverse().join('/')
}

export function addMonthsToDate(value, months) {
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.toISOString().slice(0, 10)
}

export function budgetPercent(spent, limit) {
  return limit ? BigInt(spent) * 100n / BigInt(limit) : null
}

export function monthLabel(month) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`))
}

export function followingMonth(month) {
  const [year, number] = month.split('-').map(Number)
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`
}
