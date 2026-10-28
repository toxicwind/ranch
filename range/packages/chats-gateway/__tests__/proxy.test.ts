/**
 * chats-gateway — proxy translation tests.
 *
 * The response rewrite is what lets a SPA that was built with root-absolute
 * URLs live under a gateway prefix. The CSP recomputation is what keeps the
 * rewritten page working: a stale inline-script hash would block the script.
 */
import { describe, expect, test } from 'bun:test'
import { inlineScriptHash, recomputeCsp, rewriteBody } from '../src/proxy.ts'

describe('rewriteBody', () => {
  test('re-points a quoted absolute path', () => {
    expect(
      rewriteBody('<script src="/assets/app.js"></script>', [
        { from: '/assets', to: '/kimi/assets' },
      ])
    ).toBe('<script src="/kimi/assets/app.js"></script>')
  })

  test('re-points a path inside a single-quoted string', () => {
    expect(
      rewriteBody(`const base = '/console/';`, [
        { from: '/console', to: '/kappa' },
      ])
    ).toBe(`const base = '/kappa/';`)
  })

  test('re-points an attribute value', () => {
    expect(
      rewriteBody('href=/console/assets/app.js', [
        { from: '/console', to: '/kappa' },
      ])
    ).toBe('href=/kappa/assets/app.js')
  })

  test('leaves prose alone', () => {
    expect(
      rewriteBody('the path /console is mentioned in text', [
        { from: '/console', to: '/kappa' },
      ])
    ).toBe('the path /console is mentioned in text')
  })

  test('applies every rule', () => {
    const body = '"/api/v1" and "/assets/app.js"'
    expect(
      rewriteBody(body, [
        { from: '/api/v1', to: '/kimi/api/v1' },
        { from: '/assets', to: '/kimi/assets' },
      ])
    ).toBe('"/kimi/api/v1" and "/kimi/assets/app.js"')
  })
})

describe('inlineScriptHash', () => {
  test('hashes the theme-preload script the kappa server hashes', () => {
    const html = `<script id="oc-theme-preload-script">console.log(1)</script>`
    expect(inlineScriptHash(html)).toMatch(/^sha256-/)
  })

  test('returns null when there is no such script', () => {
    expect(inlineScriptHash('<script src="/x.js"></script>')).toBeNull()
  })
})

describe('recomputeCsp', () => {
  const before = `<script id="oc-theme-preload-script">const base = "/console/";</script>`
  const after = `<script id="oc-theme-preload-script">const base = "/kappa/";</script>`

  test('replaces the stale hash with the new one', () => {
    const oldHash = inlineScriptHash(before)!
    const newHash = inlineScriptHash(after)!
    const csp = `default-src 'self'; script-src 'self' '${oldHash}'`
    const updated = recomputeCsp(csp, before, after)
    expect(updated).toContain(newHash)
    expect(updated).not.toContain(oldHash)
  })

  test('leaves a policy alone when the inline script did not change', () => {
    const hash = inlineScriptHash(before)!
    const csp = `default-src 'self'; script-src 'self' '${hash}'`
    expect(recomputeCsp(csp, before, before)).toBe(csp)
  })
})
