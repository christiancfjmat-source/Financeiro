import { useState } from 'react'
import { ChevronDown, ChevronRight, Gauge, Layers3, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import { api } from './api'
import { ErrorNotice, Modal } from './components'
import { BudgetDialog } from './budgets'
import { formatMoney, localMonth } from './finance'
import { useMonthData } from './month-data'
import { departmentIcons, tones } from './overview'

const levelNames = ['Departamento', 'Categoria', 'Subcategoria']
const normalize = text => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')

export function Categories({ items, settings, refresh, notify }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [expanded, setExpanded] = useState({})
  const [modal, setModal] = useState(null)
  const { data: report, error, reload } = useMonthData('/spending', localMonth())
  const budgets = new Map(report?.budgets.map(budget => [budget.category_id, budget]))
  const map = new Map(items.map(item => [item.id, item]))
  const children = new Map()
  for (const item of items) {
    if (!children.has(item.parent_id)) children.set(item.parent_id, [])
    children.get(item.parent_id).push(item)
  }

  const query = normalize(search.trim())
  const filtering = Boolean(query) || status !== 'all'
  const visible = new Set()
  for (const item of items) {
    const names = [item.name, map.get(item.parent_id)?.name, map.get(map.get(item.parent_id)?.parent_id)?.name]
    if ((status === 'all' || item.active === (status === 'active')) &&
      normalize(names.filter(Boolean).join(' ')).includes(query)) {
      for (let node = item; node; node = map.get(node.parent_id)) visible.add(node.id)
    }
  }

  function renderNode(item, index) {
    if (!visible.has(item.id)) return null
    const descendants = (children.get(item.id) || []).filter(child => visible.has(child.id))
    const open = filtering || (expanded[item.id] ?? (item.level === 1 && index === 0))
    const Icon = item.level === 1 ? departmentIcons[index % departmentIcons.length] : Layers3
    const budget = budgets.get(item.id)
    return <li key={item.id} className={`tree-item level-${item.level}`}>
      <div className="tree-row">
        {descendants.length > 0 ? <button type="button" className="icon-button expand"
          aria-label={`${open ? 'Recolher' : 'Expandir'} ${item.name}`} aria-expanded={open} disabled={filtering}
          onClick={() => setExpanded({ ...expanded, [item.id]: !open })}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button> : <span className="expand-placeholder" />}
        <span className={`tree-icon ${tones[index % tones.length]}`}><Icon size={item.level === 1 ? 17 : 14} /></span>
        <div className="tree-name"><strong>{item.name}</strong><small>{levelNames[item.level - 1]}</small></div>
        {!item.active && <span className="inactive">Inativo</span>}
        <div className="tree-actions">
          {item.level === 2 && <button className="icon-button budget-button" type="button"
            aria-label={`Configurar teto de ${item.name}`} title="Configurar teto mensal"
            onClick={() => setModal({ mode: 'budget', item })}><Gauge size={16} /> Teto</button>}
          {item.level < 3 && <button className="icon-button" type="button" aria-label={`Adicionar item em ${item.name}`}
            title="Adicionar item" onClick={() => setModal({ mode: 'edit', parent: item })}><Plus size={17} /></button>}
          <button className="icon-button" type="button" aria-label={`Editar ${item.name}`}
            title="Editar" onClick={() => setModal({ mode: 'edit', item })}><Pencil size={16} /></button>
          <button className="icon-button" type="button" aria-label={`${item.active ? 'Desativar' : 'Reativar'} ${item.name}`}
            title={item.active ? 'Desativar' : 'Reativar'} onClick={() => setModal({ mode: 'toggle', item })}><Power size={16} /></button>
          <button className="icon-button danger-icon" type="button" aria-label={`Excluir ${item.name}`}
            title="Excluir" onClick={() => setModal({ mode: 'delete', item })}><Trash2 size={16} /></button>
        </div>
      </div>
      {item.level === 2 && budget && <div className="tree-budget muted">
        Teto mensal {formatMoney(budget.limit_cents, settings.currency)}
      </div>}
      {open && descendants.length > 0 && <ul>{descendants.map(child => renderNode(child, index))}</ul>}
    </li>
  }

  return <>
    <section className="page-heading">
      <div><h1>Categorias</h1><p>Organize as despesas e configure os tetos mensais de cada categoria.</p></div>
      <div className="heading-actions">
        <button type="button" className="button primary" onClick={() => setModal({ mode: 'edit' })}><Plus size={18} /> Novo item</button>
      </div>
    </section>
    {error && <div className="report-error"><ErrorNotice message={error} />
      <button className="button secondary compact" onClick={reload}>Tentar novamente</button></div>}
    <section className="panel">
      <div className="filter-row">
        <label className="search"><Search size={18} /><input type="search" aria-label="Buscar categorias" placeholder="Buscar por nome" value={search}
          onChange={event => setSearch(event.target.value)} /></label>
        <select aria-label="Filtrar por situação" value={status} onChange={event => setStatus(event.target.value)}>
          <option value="all">Todas as situações</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
        </select>
      </div>
      <ul className="tree">{(children.get(null) || []).map(renderNode)}</ul>
      {!visible.size && <p className="empty">Nenhum item encontrado.</p>}
    </section>
    {modal?.mode === 'budget' && <BudgetDialog category={modal.item} settings={settings}
      onClose={() => setModal(null)} onSaved={message => { setModal(null); reload(); notify(message) }} />}
    {modal && modal.mode !== 'budget' && <CategoryModal {...modal} items={items} onClose={() => setModal(null)}
      onSuccess={async (message, parent) => {
        if (parent) setExpanded(previous => ({ ...previous, [parent]: true, [map.get(parent)?.parent_id]: true }))
        setModal(null)
        await refresh()
        notify(message)
      }} />}
  </>
}

function CategoryModal({ mode, item, parent, items, onClose, onSuccess }) {
  const [level, setLevel] = useState(item?.level ?? (parent ? parent.level + 1 : 1))
  const [parentId, setParentId] = useState(item?.parent_id ?? parent?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isEdit = mode === 'edit'
  const isDelete = mode === 'delete'
  const action = isDelete ? 'Excluir' : item?.active ? 'Desativar' : 'Reativar'
  const title = isEdit ? (item ? 'Editar item' : 'Novo item') : `${action} item`
  const body = item && { name: item.name, parent_id: item.parent_id, active: !item.active }

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (!isEdit) {
        await api(`/classifications/${item.id}`, isDelete ? 'DELETE' : 'PUT', isDelete ? undefined : body)
        await onSuccess(isDelete ? 'Item excluído.' : 'Situação atualizada.')
      } else {
        const text = name.trim()
        if (!text) throw new Error('Informe o nome.')
        const nextParent = level > 1 ? Number(parentId) : null
        const active = item?.active ?? (items.find(entry => entry.id === nextParent)?.active ?? true)
        await api(item ? `/classifications/${item.id}` : '/classifications', item ? 'PUT' : 'POST',
          { name: text, parent_id: nextParent, active })
        await onSuccess(item ? 'Item atualizado.' : 'Item criado.', nextParent)
      }
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <Modal title={title} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      {isEdit ? <>
        <label className="field">Tipo<select value={level} disabled={Boolean(item)}
          onChange={event => { setLevel(Number(event.target.value)); setParentId('') }}>
          {levelNames.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
        </select></label>
        {level > 1 && <label className="field">{levelNames[level - 2]}
          <select value={parentId} required onChange={event => setParentId(event.target.value)}>
            <option value="">Selecione</option>
            {items.filter(entry => entry.level === level - 1).map(entry => <option key={entry.id} value={entry.id}>
              {entry.level === 2 ? `${items.find(p => p.id === entry.parent_id)?.name} / ` : ''}
              {entry.name}{entry.active ? '' : ' (inativo)'}
            </option>)}
          </select></label>}
        <label className="field">Nome<input autoFocus maxLength={80} required value={name} onChange={event => setName(event.target.value)} /></label>
      </> : <>
        <p>{action} <strong>{item.name}</strong>?</p>
        {isDelete && <p className="muted">A exclusão é permanente. Itens com vínculos podem ser desativados.</p>}
        {mode === 'toggle' && item.active && item.level < 3 && <p className="muted">As categorias e subcategorias vinculadas também serão desativadas.</p>}
      </>}
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className={`button ${isDelete ? 'danger' : 'primary'}`} disabled={busy}>
          {busy ? 'Salvando…' : isEdit ? 'Salvar item' : action}
        </button>
      </footer>
    </form>
  </Modal>
}
