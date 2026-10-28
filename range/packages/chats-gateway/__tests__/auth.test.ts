/**
 * chats-gateway — front-door and upstream-credential tests.
 *
 * The security properties pinned here:
 *   - the caller's token is accepted from the Authorization header or the
 *     query string, and compared in constant time,
 *   - the caller's token is NEVER forwarded to an upstream that has not been
 *     configured to accept it,
 *   - the `?token=` query parameter is stripped before proxying.
 */
import { describe, expect, test } from 'bun:test'
import {
  basicAuthHeader,
  backendWsProtocol,
  buildUpstreamHeaders,
  envCredential,
  extractWsToken,
  requestToken,
  stripTokenParam,
  tokenMatches,
} from '../src/auth.ts'

function request(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers })
}

describe('requestToken', () => {
  test('reads the bearer header first', () => {
    const url = new URL('http://127.0.0.1/x?token=from-query')
    const token = requestToken(
      request('http://127.0.0.1/x', { authorization: 'Bearer from-header' }),
      url
    )
    expect(token).toBe('from-header')
  })

  test('falls back to the query parameter', () => {
    const url = new URL('http://127.0.0.1/x?token=from-query')
    expect(requestToken(request('http://127.0.0.1/x'), url)).toBe('from-query')
  })

  test('returns null when there is no token at all', () => {
    const url = new URL('http://127.0.0.1/x')
    expect(requestToken(request('http://127.0.0.1/x'), url)).toBeNull()
  })
})

describe('tokenMatches', () => {
  test('accepts the exact token and rejects everything else', () => {
    expect(tokenMatches('secret', 'secret')).toBe(true)
    expect(tokenMatches('secre', 'secret')).toBe(false)
    expect(tokenMatches('secrets', 'secret')).toBe(false)
    expect(tokenMatches(null, 'secret')).toBe(false)
    expect(tokenMatches('secret', '')).toBe(false)
  })
})

describe('websocket bearer protocol', () => {
  test('extracts the token from the subprotocol list', () => {
    expect(extractWsToken('kimi-code.bearer.abc')).toBe('abc')
    expect(extractWsToken('other, kimi-code.bearer.abc')).toBe('abc')
    expect(extractWsToken('other')).toBeNull()
    expect(extractWsToken(null)).toBeNull()
  })

  test('builds the upstream subprotocol', () => {
    expect(backendWsProtocol('abc')).toBe('kimi-code.bearer.abc')
  })
})

describe('stripTokenParam', () => {
  test('removes the token and keeps the rest', () => {
    expect(stripTokenParam('?token=abc')).toBe('')
    expect(stripTokenParam('?token=abc&x=1')).toBe('?x=1')
    expect(stripTokenParam('?x=1')).toBe('?x=1')
    expect(stripTokenParam('')).toBe('')
  })
})

describe('buildUpstreamHeaders', () => {
  test('never forwards the caller token when the upstream has no credential', () => {
    const headers = buildUpstreamHeaders(
      request('http://127.0.0.1/x', { authorization: 'Bearer gateway-token' }),
      { mode: 'none' }
    )
    expect(headers.get('authorization')).toBeNull()
  })

  test('swaps in the configured upstream bearer token', () => {
    const headers = buildUpstreamHeaders(
      request('http://127.0.0.1/x', { authorization: 'Bearer gateway-token' }),
      { mode: 'bearer', token: 'upstream-token' }
    )
    expect(headers.get('authorization')).toBe('Bearer upstream-token')
  })

  test('sets basic auth for a basic-auth upstream', () => {
    const headers = buildUpstreamHeaders(
      request('http://127.0.0.1/x', { authorization: 'Bearer gateway-token' }),
      { mode: 'basic', basic: { username: 'kappa', password: 'pw' } }
    )
    expect(headers.get('authorization')).toBe(basicAuthHeader('kappa', 'pw'))
  })

  test('drops hop-by-hop headers', () => {
    const headers = buildUpstreamHeaders(
      request('http://127.0.0.1/x', {
        host: 'evil.example',
        connection: 'keep-alive',
      }),
      { mode: 'none' }
    )
    expect(headers.get('host')).toBeNull()
    expect(headers.get('connection')).toBeNull()
  })
})

describe('envCredential', () => {
  test('reads the variable at call time, not at construction time', () => {
    const resolver = envCredential('CHATS_GATEWAY_TEST_PASSWORD')
    expect(resolver()).toBeUndefined()
    process.env.CHATS_GATEWAY_TEST_PASSWORD = 'later'
    expect(resolver()).toBe('later')
    delete process.env.CHATS_GATEWAY_TEST_PASSWORD
    expect(resolver()).toBeUndefined()
  })
})
