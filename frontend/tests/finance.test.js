import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addMonthsToDate, amountInput, followingMonth, formatMoney, localMonth, parseMoney } from '../src/finance.js'

test('BRL input preserves cents and normalizes Brazilian separators', () => {
  assert.equal(parseMoney('14.014,87', 'Salário'), 1_401_487)
  assert.equal(parseMoney('0,1', 'Salário'), 10)
  assert.equal(parseMoney('-75,06', 'Caixa', { signed: true }), -7506)
  assert.equal(parseMoney('', 'Reserva', { optional: true }), null)
  assert.equal(amountInput(1_401_487), '14.014,87')
  assert.equal(amountInput(-7506), '-75,06')
  assert.equal(formatMoney(1_401_487, 'BRL').replace(/\s/g, ' '), 'R$ 14.014,87')
})

test('invalid and unsafe money values are rejected', () => {
  for (const value of ['1,234', '123.45', '1e3', '-500', '99999999999,99']) {
    assert.throws(() => parseMoney(value, 'Salário'))
  }
})

test('month follows the São Paulo calendar and crosses December correctly', () => {
  assert.equal(localMonth(new Date('2027-01-01T01:20:00Z')), '2026-12')
  assert.equal(followingMonth('2026-12'), '2027-01')
})

test('expense horizon handles leap days and end-of-month dates', () => {
  assert.equal(addMonthsToDate('2028-02-29', 36), '2031-02-28')
  assert.equal(addMonthsToDate('2026-11-20', 36), '2029-11-20')
  assert.equal(addMonthsToDate('2026-01-31', 25), '2028-02-29')
})
