/**
 * chats-gateway — the front door and the upstream credentials.
 *
 * Two directions of trust meet here:
 *
 *   browser → gateway   one bearer token (`CHATS_GATEWAY_TOKEN`). Accepted as
 *                       `Authorization: Bearer <token>` or as `?token=<token>`
 *                       (browsers cannot set headers on WebSocket handshakes
 *                       or on plain navigations, so the query form is the
 *                       escape hatch — the same trick the kimi WebUI uses).
 *
 *   gateway → upstream   per-surface credentials. For kappa that is HTTP
 *                       Basic auth with a password that lives in the process
 *                       environment and is resolved AT REQUEST TIME. The
 *                       gateway never writes it down and never logs it.
 *
 * The one rule that keeps this honest: the caller's gateway token is NEVER
 * forwarded to an upstream that has not been explicitly configured to accept
 * it. A gateway token is a credential of THIS service; handing it to a third
 * party (the kimi backend, the kappa server) would leak it.
 */

import { timingSafeEqual } from 'node:crypto'

/** WS subprotocol prefix kap-server (kimi) uses for bearer auth. */
export const WS_BEARER_PROTOCOL_PREFIX = 'kimi-code.bearer.'

/**
 * A credential that is read from the environment when it is needed.
 *
 * Returning a resolver instead of a value keeps the secret out of every
 * long-lived object, out of the config, and out of any log line.
 */
export type CredentialResolver = () => string | undefined

/** Build a resolver that reads `name` from the environment on every call. */
export function envCredential(name: string): CredentialResolver {
  return () => {
    const value = process.env[name]
    return value && value.trim() !== '' ? value : undefined
  }
}

/**
 * Pull the caller's token from `Authorization: Bearer` or `?token=`.
 *
 * The header wins; the query parameter is the fallback for navigations and
 * WebSocket handshakes that cannot carry headers.
 */
export function requestToken(req: Request, url: URL): string | null {
  const auth = req.headers.get('authorization')
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token) return token
  }
  return url.searchParams.get('token')
}

/** Constant-time comparison of a candidate token against the expected one. */
export function tokenMatches(
  candidate: string | null | undefined,
  expected: string
): boolean {
  if (!candidate || !expected) return false
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Extract the bearer token from a WS `Sec-WebSocket-Protocol` header. */
export function extractWsToken(
  protocolHeader: string | null | undefined
): string | null {
  if (!protocolHeader) return null
  for (const entry of protocolHeader.split(',')) {
    const candidate = entry.trim()
    if (candidate.startsWith(WS_BEARER_PROTOCOL_PREFIX)) {
      const token = candidate.slice(WS_BEARER_PROTOCOL_PREFIX.length)
      if (token) return token
    }
  }
  return null
}

/** Build the WS subprotocol value to present to the upstream. */
export function backendWsProtocol(token: string): string {
  return `${WS_BEARER_PROTOCOL_PREFIX}${token}`
}

/** Strip `?token=` / `&token=` from a query string before proxying upstream. */
export function stripTokenParam(search: string): string {
  const params = new URLSearchParams(search)
  params.delete('token')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

/** Build an HTTP Basic `Authorization` value. */
export function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

export type UpstreamAuthMode = 'none' | 'bearer' | 'basic'

export interface UpstreamAuth {
  mode: UpstreamAuthMode
  /** Token the upstream expects (bearer mode). */
  token?: string
  /** Basic credentials (basic mode). */
  basic?: { username: string; password: string }
}

/** Headers that must not be copied verbatim onto an upstream request. */
const HOP_BY_HOP = [
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

/**
 * Rewrite request headers for an upstream call.
 *
 * - hop-by-hop headers are dropped,
 * - the caller's `Authorization` is dropped and replaced with the upstream
 *   credential when one is configured,
 * - when no upstream credential is configured the caller's `Authorization` is
 *   dropped too: the gateway token is not the upstream's business.
 */
export function buildUpstreamHeaders(
  req: Request,
  auth: UpstreamAuth
): Headers {
  const headers = new Headers(req.headers)
  for (const name of HOP_BY_HOP) headers.delete(name)
  headers.delete('authorization')

  if (auth.mode === 'bearer' && auth.token) {
    headers.set('authorization', `Bearer ${auth.token}`)
  } else if (auth.mode === 'basic' && auth.basic) {
    headers.set(
      'authorization',
      basicAuthHeader(auth.basic.username, auth.basic.password)
    )
  }
  return headers
}
