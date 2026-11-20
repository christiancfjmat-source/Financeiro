import { useEffect, useState } from 'react'
import { Banknote, Bell, CalendarDays, Landmark, Palette, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { api } from './api'
import { ErrorNotice, Modal, MoneyInput } from './components'
import { followingMonth, formatMoney, localMonth, monthLabel, parseMoney } from './finance'

export function Settings({ settings, revisions, refresh, notify }) {
  const [currency, setCurrency] = useState(settings.currency)
  const [theme, setTheme] = useState(settings.theme)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const month = localMonth()
  useEffect(() => { setTheme(settings.theme) }, [settings.theme])

  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const attention = Number(values.get('alert_attention'))
      const near = Number(values.get('alert_near'))
      const limit = Number(values.get('alert_limit'))
      if (!(attention < near && near < limit)) throw new Error('Informe percentuais crescentes para atenção, aviso e limite.')
      const name = values.get('name').trim()
      if (!name) throw new Error('Informe o nome do sistema.')
      await api('/settings', 'PUT', {
        name, currency, theme,
        salary_cents: parseMoney(values.get('salary_cents'), 'Salário líquido base'),
        extraordinary_cents: settings.extraordinary_cents,
        payday: values.get('payday') ? Number(values.get('payday')) : null,
        opening_cash_cents: parseMoney(values.get('opening_cash_cents'), 'Caixa inicial', { optional: true, signed: true }),
        opening_reserve_cents: parseMoney(values.get('opening_reserve_cents'), 'Reserva inicial', { optional: true }),
        projection_months: Number(values.get('projection_months')),
        alert_attention: attention, alert_near: near, alert_limit: limit,
      })
      await refresh()
      notify('Configurações salvas.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <>
    <section className="page-heading">
      <div><h1>Configurações</h1><p>Personalize suas preferências e informe os valores de abertura.</p></div>
      <button className="button primary" type="submit" form="preferences" disabled={busy}><Save size={17} />
        {busy ? 'Salvando…' : 'Salvar configurações'}</button>
    </section>
    <ErrorNotice message={error} />
    <form className="settings-grid" id="preferences" onSubmit={submit}>
      <SettingsCard Icon={Palette} title="Geral">
        <label className="field">Nome do sistema<input name="name" defaultValue={settings.name} required maxLength={80} /></label>
        <div className="fields-two">
          <label className="field">Moeda<select value={currency} onChange={event => setCurrency(event.target.value)}>
            <option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option>
          </select></label>
          <label className="field">Tema<select value={theme} onChange={event => setTheme(event.target.value)}>
            <option value="light">Claro</option><option value="dark">Escuro</option><option value="system">Sistema</option>
          </select></label>
        </div>
        <p className="field-note">A moeda define a apresentação dos valores. Trocar a moeda mantém os valores nominais.</p>
      </SettingsCard>
      <SettingsCard Icon={Banknote} title="Renda">
        <div className="fields-two">
          <MoneyInput label="Salário líquido base" name="salary_cents" currency={currency} cents={settings.salary_cents} required />
          <label className="field">Dia de recebimento<input type="number" name="payday" min="1" max="31"
            defaultValue={settings.payday ?? ''} placeholder="A definir" /></label>
        </div>
        <div className="salary-revisions">
          <div className="panel-heading">
            <h3>Reajustes salariais</h3>
            <button className="button secondary compact" type="button" onClick={() => setModal({})}>
              <Plus size={17} /> Agendar reajuste
            </button>
          </div>
          {!revisions.length && <p className="field-note">Nenhum reajuste agendado.</p>}
          {revisions.length > 0 && <ul className="revision-list">
            {revisions.map(item => {
              const future = item.effective_month.slice(0, 7) > month
              return <li key={item.effective_month}>
                <CalendarDays size={18} /><span>{monthLabel(item.effective_month)}</span>
                <strong>{formatMoney(item.amount_cents, settings.currency)}</strong>
                {future && <div className="tree-actions">
                  <button className="icon-button" type="button" aria-label="Editar reajuste"
                    onClick={() => setModal({ item })}><Pencil size={17} /></button>
                  <button className="icon-button danger-icon" type="button" aria-label="Remover reajuste"
                    onClick={() => setModal({ item, remove: true })}><Trash2 size={17} /></button>
                </div>}
              </li>
            })}
          </ul>}
        </div>
      </SettingsCard>
      <SettingsCard Icon={Landmark} title="Saldos iniciais">
        <div className="fields-two">
          <MoneyInput label="Caixa inicial" name="opening_cash_cents" currency={currency} cents={settings.opening_cash_cents} signed />
          <MoneyInput label="Reserva inicial" name="opening_reserve_cents" currency={currency} cents={settings.opening_reserve_cents} />
        </div>
        <p className="field-note">Deixe em branco enquanto o saldo de abertura estiver indefinido.</p>
      </SettingsCard>
      <SettingsCard Icon={Bell} title="Alertas e projeções">
        <div className="fields-three">
          {[['Atenção (%)', 'alert_attention'], ['Próximo (%)', 'alert_near'], ['Limite (%)', 'alert_limit']].map(([label, name]) =>
            <label key={name} className="field">{label}<input name={name} type="number" min="1" max="100"
              defaultValue={settings[name]} required /></label>)}
        </div>
        <label className="field">Horizonte em meses<input name="projection_months" type="number" min="24" max="60"
          defaultValue={settings.projection_months} required /></label>
        <p className="field-note">O horizonte limita a exibição dos lançamentos fixos futuros.</p>
      </SettingsCard>
    </form>
    {modal && <RevisionModal {...modal} min={followingMonth(month)} currency={settings.currency} onClose={() => setModal(null)}
      onSuccess={async () => {
        setModal(null)
        await refresh()
        notify(modal.remove ? 'Reajuste removido.' : 'Reajuste salvo.')
      }} />}
  </>
}

function SettingsCard({ Icon, title, children }) {
  return <section className="panel settings-card" aria-label={title}>
    <h2><span className="setup-icon"><Icon size={18} /></span>{title}</h2>{children}
  </section>
}

function RevisionModal({ item, remove, currency, min, onClose, onSuccess }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    const path = item ? `/salary-revisions/${item.effective_month}` : '/salary-revisions'
    setBusy(true)
    setError('')
    try {
      if (remove) await api(path, 'DELETE')
      else await api(path, item ? 'PUT' : 'POST', {
        effective_month: `${values.get('month')}-01`,
        amount_cents: parseMoney(values.get('amount'), 'Novo salário líquido'),
      })
      await onSuccess()
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <Modal title={remove ? 'Remover reajuste' : item ? 'Editar reajuste' : 'Agendar reajuste'}
    onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {remove ? <p>Remover o reajuste de <strong>{monthLabel(item.effective_month)}</strong>?</p> : <>
        <label className="field">Mês de início<input type="month" name="month" min={min} max="9999-12" required
          defaultValue={item?.effective_month.slice(0, 7) || ''} /></label>
        <MoneyInput label="Novo salário líquido" name="amount" cents={item?.amount_cents} currency={currency} required />
      </>}
      <footer className="dialog-actions">
        <button className="button secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className={`button ${remove ? 'danger' : 'primary'}`} type="submit" disabled={busy}>
          {busy ? 'Salvando…' : remove ? 'Remover' : 'Salvar reajuste'}</button>
      </footer>
    </form>
  </Modal>
}
