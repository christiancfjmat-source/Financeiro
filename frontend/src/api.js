export async function api(path, method = 'GET', data, signal) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  })
  if (response.status === 204) return null
  const result = await response.json()
  if (!response.ok) {
    const message = Array.isArray(result.detail)
      ? result.detail.map(issue => issue.msg.replace(/^Value error, /, '')).join(' ')
      : result.detail
    throw new Error(message || 'Não foi possível concluir a operação.')
  }
  return result
}
