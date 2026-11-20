import { useEffect, useState } from 'react'
import { api } from './api'

export function useMonthData(path, month, version = 0) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const url = `${path}${path.includes('?') ? '&' : '?'}month=${month}`
    api(url, 'GET', undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ path, month, version, attempt, data }) })
      .catch(failure => {
        if (!controller.signal.aborted) setState({ path, month, version, attempt, error: failure.message })
      })
    return () => controller.abort()
  }, [path, month, version, attempt])
  const current = state?.path === path && state.month === month && state.version === version && state.attempt === attempt ? state : {}
  return { ...current, reload: () => setAttempt(value => value + 1) }
}
