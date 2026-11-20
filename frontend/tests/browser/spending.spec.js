import { expect, test } from '@playwright/test'
import { addMonthsToDate, followingMonth, localDate, localMonth, monthLabel } from '../../src/finance.js'

test('configura um teto recorrente e consulta o consumo por mês', async ({ page }) => {
  const month = localMonth()
  await page.goto('/')
  await page.getByRole('link', { name: 'Tags', exact: true }).click()
  await page.getByRole('button', { name: 'Nova tag' }).click()
  await page.getByLabel('Nome da tag').fill('Compra semanal')
  await page.getByRole('button', { name: 'Salvar tag' }).click()
  await expect(page.getByText('Tag criada.')).toBeVisible()

  await page.getByRole('link', { name: 'Categorias', exact: true }).click()
  await expect(page.getByLabel('Mês de referência')).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Buscar categorias' }).fill('supermercado')
  await page.getByRole('button', { name: 'Configurar teto de Supermercado' }).click()
  await expect(page.getByText(`Vigência a partir de ${monthLabel(month)}`)).toBeVisible()
  await page.getByLabel('Valor do teto mensal').fill('850,00')
  await page.getByRole('button', { name: 'Salvar teto' }).click()
  await expect(page.getByText('Teto mensal salvo.')).toBeVisible()
  await expect(page.getByText('Teto mensal R$ 850,00')).toBeVisible()

  await page.getByRole('link', { name: 'Visão geral', exact: true }).click()
  const picker = page.getByLabel('Mês de referência')
  const budgets = page.getByRole('region', { name: 'Tetos por departamento' })
  const food = budgets.locator('summary').filter({ hasText: 'Alimentação' })
  await picker.fill(followingMonth(month))
  await expect(food.getByText(/850,00 disponível/)).toBeVisible()
  await picker.fill(month)
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Forma de pagamento' }).selectOption({ label: 'Pix' })
  await dialog.getByLabel('Valor da despesa').fill('250,10')
  await dialog.getByLabel('Data da despesa').fill(`${month}-12`)
  await dialog.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption({ label: 'Supermercado' })
  await dialog.getByLabel('Descrição (opcional)').fill('Feira da semana')
  await dialog.getByRole('checkbox', { name: 'Compra semanal' }).check()
  await dialog.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByText('Despesa registrada.')).toBeVisible()
  await expect(food.getByText(/599,90 disponível/)).toBeVisible()
  await food.click()
  const supermarketBudget = budgets.locator('.budget-categories > li').filter({ hasText: 'Supermercado' })
  await expect(supermarketBudget.getByRole('meter')).toHaveAttribute('aria-valuenow', '29')

  await page.getByRole('link', { name: 'Ver despesas' }).click()
  await expect(page.getByText('Feira da semana', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByLabel('Filtrar despesas por tag').selectOption({ label: 'Compra semanal' })
  await expect(page.getByText('Feira da semana', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar despesa: Feira da semana' }).click()
  await page.getByLabel('Valor da despesa').fill('900,10')
  await page.getByRole('button', { name: 'Salvar despesa' }).click()
  await expect(page.getByText('Despesa atualizada.')).toBeVisible()
  await page.getByRole('link', { name: 'Visão geral', exact: true }).click()
  await expect(food.getByText(/50,10 acima do teto/)).toBeVisible()
  await food.click()
  await expect(supermarketBudget.getByText('Excedido', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ver despesas' }).click()
  await page.getByRole('button', { name: 'Nova despesa' }).click()
  await dialog.getByRole('combobox', { name: 'Forma de pagamento' }).selectOption({ label: 'Pix' })
  await dialog.getByLabel('Valor da despesa').fill('10,00')
  await dialog.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption({ label: 'Combustível' })
  await dialog.getByRole('button', { name: 'Salvar despesa' }).click()
  await page.getByRole('button', { name: 'Excluir despesa: Combustível' }).click()
  await dialog.getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(page.getByText('Despesa excluída.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Excluir despesa: Combustível' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Visão geral', exact: true }).click()
  await page.getByLabel('Mês de referência').fill('2025-01')
  const housing = budgets.locator('summary').filter({ hasText: 'Moradia' })
  await expect(housing.getByText('Teto R$ 0,00')).toBeVisible()
})

test('soma os tetos por departamento e mostra as categorias ao expandir', async ({ page }) => {
  const month = addMonthsToDate(localDate(), 14).slice(0, 7)
  const classifications = await (await page.request.get('/api/classifications')).json()
  for (const [name, limit_cents] of [['Aluguel', 20_000], ['Energia elétrica', 15_000], ['Consultas', 70_000]]) {
    const category = classifications.find(item => item.name === name)
    const response = await page.request.put(`/api/budgets/${category.id}`, { data: { limit_cents } })
    expect(response.ok()).toBe(true)
  }

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Configuração inicial' })).toHaveCount(0)
  await page.getByLabel('Mês de referência').fill(month)
  const budgets = page.getByRole('region', { name: 'Tetos por departamento' })
  const housing = budgets.locator('summary').filter({ hasText: 'Moradia' })
  await expect(housing.getByText('Teto R$ 350,00')).toBeVisible()
  await expect(budgets.locator('summary').filter({ hasText: 'Saúde' }).getByText('Teto R$ 700,00')).toBeVisible()
  await expect(budgets.getByText('Condomínio', { exact: true })).toBeHidden()

  await housing.click()
  const energy = budgets.locator('.budget-categories > li').filter({ hasText: 'Energia elétrica' })
  const condo = budgets.locator('.budget-categories > li').filter({ hasText: 'Condomínio' })
  await expect(energy.getByText('de R$ 150,00', { exact: false })).toBeVisible()
  await expect(condo.getByText('Teto R$ 0,00')).toBeVisible()
  await housing.click()
  await expect(condo).toBeHidden()
})

test('combina vários departamentos e categorias com os vínculos originais das despesas', async ({ page }) => {
  const month = '2024-06'
  async function classification(name, parent_id) {
    const response = await page.request.post('/api/classifications', { data: { name, parent_id } })
    expect(response.ok()).toBe(true)
    return (await response.json()).id
  }
  const north = await classification('Projeto Norte')
  const south = await classification('Projeto Sul')
  const supplies = await classification('Material de obra', north)
  const fees = await classification('Taxas de obra', north)
  const freight = await classification('Frete de obra', south)
  for (const [department_id, category_id, description, amount_cents] of [
    [north, supplies, 'Compra de material', 7_000],
    [north, fees, 'Pagamento de taxa', 12_000],
    [south, freight, 'Pagamento de frete', 18_000],
  ]) {
    const response = await page.request.post('/api/expenses', {
      data: { department_id, category_id, description, amount_cents, occurred_on: `${month}-10` },
    })
    expect(response.ok()).toBe(true)
  }
  const moved = await page.request.put(`/api/classifications/${supplies}`, {
    data: { name: 'Material de obra', parent_id: south },
  })
  expect(moved.ok()).toBe(true)

  await page.goto('/#despesas')
  await page.getByLabel('Mês de referência').fill(month)
  const rows = page.getByRole('list', { name: 'Lançamentos do mês' }).getByRole('listitem')
  await expect(rows).toHaveCount(3)
  const departmentButton = page.getByRole('button', { name: /^Departamentos/ })
  const categoryButton = page.getByRole('button', { name: /^Categorias/ })
  const departments = page.getByRole('group', { name: 'Departamentos' })
  const categories = page.getByRole('group', { name: 'Categorias' })

  await departmentButton.click()
  await departments.getByRole('checkbox', { name: 'Projeto Norte' }).check()
  await expect(rows).toHaveCount(2)
  await categoryButton.click()
  await expect(departments).toHaveCount(0)
  await expect(categories.getByRole('checkbox', { name: /Frete de obra/ })).toHaveCount(0)
  await categories.getByRole('checkbox', { name: /Material de obra.*Projeto Norte/ }).check()
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Compra de material')
  await expect(page.getByText('R$ 70,00', { exact: true })).toHaveCount(2)

  await departmentButton.click()
  await departments.getByRole('checkbox', { name: 'Projeto Sul' }).check()
  await expect(departmentButton).toHaveText('Departamentos2')
  await categoryButton.click()
  await categories.getByRole('checkbox', { name: /Frete de obra/ }).check()
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: 'Pagamento de taxa' })).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await categories.getByRole('button', { name: 'Limpar' }).click()
  await expect(rows).toHaveCount(3)
  await categoryButton.press('Escape')
  await expect(categories).toHaveCount(0)
  await expect(categoryButton).toBeFocused()
})

test('filtra categorias pela rosca e abre os lançamentos no próprio painel', async ({ page }) => {
  const month = addMonthsToDate(localDate(), 16).slice(0, 7)
  const classifications = await (await page.request.get('/api/classifications')).json()
  const entries = [
    ['Aluguel', 20_000, 10_000, 'Aluguel para consulta'],
    ['Energia elétrica', 5_000, 10_000, 'Conta de luz para consulta'],
    ['Combustível', null, 5_000, 'Abastecimento para consulta'],
  ]
  for (const [name, limit_cents, amount_cents, description] of entries) {
    const category = classifications.find(item => item.name === name)
    const path = `/api/budgets/${category.id}`
    const budget = limit_cents == null ? await page.request.delete(path) : await page.request.put(path, { data: { limit_cents } })
    expect(budget.ok()).toBe(true)
    const expense = await page.request.post('/api/expenses', { data: {
      category_id: category.id, department_id: category.parent_id, occurred_on: `${month}-12`, amount_cents, description,
    } })
    expect(expense.ok()).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByLabel('Mês de referência').fill(month)
  const chart = page.getByRole('region', { name: 'Gastos por departamento' })
  const categories = page.getByRole('region', { name: 'Gastos por categoria' })
  const housing = chart.getByRole('button', { name: /^Moradia/ })
  const fuel = categories.getByRole('button', { name: /^Combustível/ })
  await expect(fuel).toContainText('Sem teto')
  const ring = chart.locator('.donut-ring')
  const { width, height } = await ring.boundingBox()
  await ring.click({ position: { x: width * .75, y: height * .25 } })
  await expect(housing).toHaveAttribute('aria-pressed', 'true')
  await expect(fuel).toHaveCount(0)
  const rent = categories.getByRole('button', { name: /^Aluguel/ })
  await expect(rent).toContainText('R$ 100,00')
  await expect(rent).toContainText('R$ 200,00')
  await expect(rent).toContainText('50% do teto')
  await expect(rent).toContainText('Dentro do teto')
  const energy = categories.getByRole('button', { name: /^Energia elétrica/ })
  await expect(energy).toContainText('200% do teto')
  await expect(energy).toContainText('Ultrapassado')

  await energy.click()
  const detail = categories.getByRole('list', { name: 'Despesas de Energia elétrica' })
  await expect(detail.getByRole('listitem')).toHaveCount(1)
  await expect(detail.getByText('Conta de luz para consulta')).toBeVisible()
  await expect(detail.getByText('R$ 100,00')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)

  await chart.getByRole('button', { name: /^Transporte/ }).click()
  await expect(detail).toHaveCount(0)
  await expect(energy).toHaveCount(0)
  await fuel.click()
  await expect(categories.getByRole('list', { name: 'Despesas de Combustível' })
    .getByText('Abastecimento para consulta')).toBeVisible()
  await chart.getByRole('button', { name: 'Todos', exact: true }).click()
  await expect(energy).toBeVisible()
  await expect(fuel).toHaveAttribute('aria-expanded', 'false')
})
