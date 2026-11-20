const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 })

const departmentColors = [
  '#3e9c75', '#d77d4c', '#5884c0', '#c66d94', '#9076c6', '#ae8e3e', '#389c9a', '#708397',
]

function dialPosition(fraction, radius) {
  const angle = Math.PI * fraction
  return {
    left: `${50 - radius * Math.cos(angle)}%`,
    top: `${100 - 2 * radius * Math.sin(angle)}%`,
    '--marker-rotation': `${180 * fraction - 90}deg`,
  }
}

export function BudgetGauge({ spent, budget, income, money, error }) {
  const ready = spent != null && budget != null && income != null
  return <section className="panel distribution" aria-label="Medidor do orçamento">
    <div className="panel-heading"><h2>Medidor do orçamento</h2></div>
    {ready ? <BudgetDial spent={spent} budget={budget} income={income} money={money} />
      : !error && <p className="empty" role="status">Carregando medidor…</p>}
  </section>
}

function BudgetDial({ spent, budget, income, money }) {
  const highest = Math.max(spent, budget, income)
  const scale = income && highest > income ? Math.ceil(highest / income * 4) * income / 4 : highest || 1
  const spendingShare = income ? percent.format(spent / income) : null
  const scaleEnd = income ? (scale === income ? '100% da renda' : percent.format(scale / income)) : money(highest)

  return <>
    <div className={`budget-dial ${spent > income ? 'over-income' : ''}`}>
      <div className="dial-face" role="meter" aria-label="Despesas em relação à renda"
        aria-valuemin={0} aria-valuemax={scale} aria-valuenow={spent}
        aria-valuetext={spendingShare ? `${money(spent)}, ${spendingShare} da renda` : `${money(spent)} sem renda no mês`}>
        <div className="dial-track" style={{ '--spent-sweep': `${spent / scale * 180}deg` }} />
        <span className="dial-tick" style={dialPosition(budget / scale, 44)} />
        {income > 0 && <span className="dial-income-point" style={dialPosition(income / scale, 35)} />}
        <div className="dial-reading">
          <strong>{spendingShare ?? money(spent)}</strong>
          <span>{spendingShare ? 'da renda utilizada' : 'Sem renda no mês'}</span>
        </div>
      </div>
      <div className="dial-axis"><span>{income ? '0%' : money(0)}</span><span>{scaleEnd}</span></div>
    </div>
    <dl className="dial-legend">
      <div><dt><span className="dial-key dial-key-spent" />Despesas</dt><dd>{money(spent)}</dd></div>
      <div><dt><span className="dial-key dial-key-budget" />Teto total</dt><dd>{money(budget)}</dd></div>
      <div><dt><span className="dial-key dial-key-income" />Renda disponível{income > 0 && <small>100%</small>}</dt><dd>{money(income)}</dd></div>
    </dl>
  </>
}

export function DepartmentDonut({ amounts, classifications, money, error, selected, onSelect }) {
  const departments = classifications.filter(item => item.level === 1)
  const byId = new Map(departments.map((item, index) => [item.id, {
    name: item.name,
    color: departmentColors[index] ?? `hsl(${index * 137.5 % 360} 52% ${index % 2 ? 46 : 60}%)`,
  }]))
  const entries = Object.entries(amounts || {}).filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]).map(([key, amount]) => ({
      id: Number(key), amount, ...byId.get(Number(key)),
    }))
  const total = entries.reduce((sum, item) => sum + item.amount, 0)
  let cumulative = 0
  const slices = entries.map(item => {
    const start = cumulative / total
    cumulative += item.amount
    return { ...item, start, end: cumulative / total }
  })
  const active = entries.find(item => item.id === selected)
  const gradient = slices.map(item => {
    const color = active && item.id !== active.id ? `color-mix(in srgb, ${item.color} 32%, var(--surface))` : item.color
    return `${color} ${item.start * 100}% ${item.end * 100}%`
  }).join(', ')

  function selectSlice(event) {
    const { left, top, width } = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - left) / width - .5
    const y = (event.clientY - top) / width - .5
    const radius = Math.hypot(x, y)
    if (radius < .32 || radius > .5) return
    const fraction = (Math.atan2(x, -y) / (2 * Math.PI) + 1) % 1
    const slice = slices.find(item => fraction < item.end)
    if (slice) onSelect(slice.id)
  }

  return <section className="panel distribution" aria-label="Gastos por departamento">
    <div className="panel-heading">
      <div><h2>Gastos por departamento</h2><p>Participação nas despesas do mês</p></div>
      {active && <button className="button secondary compact" type="button" onClick={() => onSelect(null)}>Todos</button>}
    </div>
    {!amounts && !error && <p className="empty" role="status">Carregando gastos…</p>}
    {amounts && (entries.length === 0 ? <p className="empty">Nenhuma despesa registrada neste mês.</p>
      : <div className="department-donut">
        <div className="donut-ring" style={{ backgroundImage: `conic-gradient(${gradient})` }} onClick={selectSlice} aria-hidden="true">
          <div className="donut-center"><span>{active?.name ?? 'Total do mês'}</span><strong>{money(active?.amount ?? total)}</strong></div>
        </div>
        <ul className="donut-legend" aria-label="Despesas por departamento">
          {entries.map(item => <li key={item.id}>
            <button type="button" aria-pressed={item.id === selected} onClick={() => onSelect(item.id)}>
              <span className="donut-key" aria-hidden="true" style={{ backgroundColor: item.color }} />
              <span className="donut-label">{item.name}</span>
              <strong>{money(item.amount)}</strong>
              <span className="donut-percent">{percent.format(item.amount / total)}</span>
            </button>
          </li>)}
        </ul>
      </div>)}
  </section>
}
