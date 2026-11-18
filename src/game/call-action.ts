import { getAuthToken } from 'deepspace'

/**
 * POST /api/actions/:name with the signed-in user's bearer token. The worker
 * (src/server/action-routes.ts) verifies the JWT and refuses calls without it.
 */
export async function callAction<T = unknown>(name: string, params: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in first.')
  const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || body.success === false) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data as T
}
