import { useState } from 'react'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { api } from './api'
import { DeleteModal, ErrorNotice, Modal } from './components'

export function TagsPage({ tags, refresh, notify }) {
  const [dialog, setDialog] = useState(null)
  const close = () => setDialog(null)
  function saved(message) {
    close()
    void refresh()
    notify(message)
  }

  return <>
    <section className="page-heading">
      <div><h1>Tags</h1><p>Organize lançamentos de categorias diferentes com uma mesma tag.</p></div>
      <button className="button primary" onClick={() => setDialog({})}><Plus size={18} /> Nova tag</button>
    </section>
    <section className="panel">
      {tags.length ? <ul className="tag-register" aria-label="Tags cadastradas">{tags.map(tag =>
        <li key={tag.id} className="tree-row">
          <span className="tree-icon"><Tag size={16} /></span>
          <div className="tree-name"><strong>{tag.name}</strong></div>
          <div className="tree-actions">
            <button className="icon-button" aria-label={`Editar tag: ${tag.name}`} onClick={() => setDialog({ tag })}><Pencil size={17} /></button>
            <button className="icon-button danger-icon" aria-label={`Excluir tag: ${tag.name}`}
              onClick={() => setDialog({ tag, remove: true })}><Trash2 size={17} /></button>
          </div>
        </li>)}</ul> : <p className="empty">Nenhuma tag cadastrada.</p>}
    </section>
    {dialog?.remove && <DeleteModal title="Excluir tag" onClose={close} onSuccess={() => saved('Tag excluída.')}
      action={() => api(`/tags/${dialog.tag.id}`, 'DELETE')}>
      <p>Excluir a tag <strong>{dialog.tag.name}</strong>?</p>
    </DeleteModal>}
    {dialog && !dialog.remove && <TagForm tag={dialog.tag} onClose={close} onSaved={saved} />}
  </>
}

function TagForm({ tag, onClose, onSaved }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const name = new FormData(event.currentTarget).get('name').trim()
    if (!name) {
      setError('Informe o nome da tag.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api(tag ? `/tags/${tag.id}` : '/tags', tag ? 'PUT' : 'POST', { name })
      onSaved(tag ? 'Tag atualizada.' : 'Tag criada.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title={tag ? 'Editar tag' : 'Nova tag'} onClose={() => { if (!busy) onClose() }}>
    <form onSubmit={submit}>
      <ErrorNotice message={error} />
      <label className="field">Nome da tag<input name="name" maxLength={80} defaultValue={tag?.name}
        placeholder="Ex. Viagem ou trabalho" autoFocus required /></label>
      <footer className="dialog-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar tag'}</button>
      </footer>
    </form>
  </Modal>
}
