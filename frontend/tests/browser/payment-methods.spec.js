import { expect, test } from '@playwright/test'
import { addMonthsToDate, dateLabel, followingMonth, localDate } from '../../src/finance.js'

test('cadastra cartão e calcula vencimento ao lançar uma despesa comum', async ({ page }) => {
  await page.goto('/#pagamentos')
  await expect(page.getByRole('heading', { name: 'Formas de pagamento', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Pix', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Débito automático', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Nova forma de pagamento' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Nome da forma de pagamento').fill('Cartão da casa')
  await dialog.getByRole('combobox', { name: 'Categoria da forma de pagamento' }).selectOption('credito')
  await dialog.getByLabel('Dia de vencimento').fill('10')
  await dialog.getByRole('button', { name: 'Salvar forma de pagamento' }).click()
  await expect(page.getByText('Cartão da casa', { exact: true })).toBeVisible()
  await expect(page.getByText('Vencimento no dia 10')).toBeVisible()

  await page.getByRole('link', { name: 'Visão geral', exact: true }).click()
  await page.getByRole('button', { name: 'Nova despesa', exact: true }).click()
  await expect(dialog.getByRole('radio', { name: 'Despesa comum', exact: true })).toBeChecked()
  const method = dialog.getByRole('combobox', { name: 'Forma de pagamento' })
  await method.selectOption({ label: 'Cartão de crédito' })
  await expect(dialog.getByRole('button', { name: 'Salvar despesa' })).toBeDisabled()
  await expect(dialog.getByRole('status')).toContainText('Configure o vencimento deste cartão')
  await method.selectOption({ label: 'Cartão da casa' })
  await expect(dialog.getByLabel('Data da compra')).toHaveValue(localDate())
  await expect(dialog.getByLabel('Dia de vencimento')).toHaveCount(0)

  const month = addMonthsToDate(localDate(), -6).slice(0, 7)
  const purchase = `${month}-27`
  const due = `${followingMonth(month)}-10`
  await dialog.getByLabel('Data da compra').fill(purchase)
  await expect(dialog.getByLabel('Vencimento previsto')).toHaveCount(0)
  await expect(dialog.locator(':scope > [role="status"]')).toHaveText(`Vencimento previsto em ${dateLabel(due)}.`)
  await dialog.getByLabel('Valor da despesa').fill('80,50')
  await dialog.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption({ label: 'Supermercado' })
  await dialog.getByLabel('Descrição (opcional)').fill('Compra no cartão')
  await dialog.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByLabel('Mês de referência')).toHaveValue(month)
  await page.getByRole('link', { name: 'Despesas', exact: true }).click()
  await expect(page.getByText(`Cartão da casa · Vencimento previsto em ${dateLabel(due)}`)).toBeVisible()
})
