export const api = {
  async get(path: string) {
    const r = await fetch(`/api${path}`, { credentials: 'include' })
    if (!r.ok) throw new Error(await r.text()); return r.json()
  },
  async post(path: string, body?: any) {
    const r = await fetch(`/api${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: body ? JSON.stringify(body) : undefined
    })
    if (!r.ok) throw new Error(await r.text()); return r.json()
  },
  async patch(path: string, body?: any) {
    const r = await fetch(`/api${path}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: body ? JSON.stringify(body) : undefined
    })
    if (!r.ok) throw new Error(await r.text()); return r.json()
  },
  async del(path: string) {
    const r = await fetch(`/api${path}`, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) throw new Error(await r.text()); return r.json()
  }
}
