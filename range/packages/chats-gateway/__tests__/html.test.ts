/**
 * chats-gateway — page rendering tests.
 *
 * The landing page is the prototype's two-tab shell generalised to three
 * agents, so the pane ids the prototype asserted on are still asserted here.
 */
import { describe, expect, test } from 'bun:test'
import {
  escapeHtml,
  renderLandingPage,
  renderNotFoundPage,
  renderTauShell,
  renderUnavailablePage,
  type SurfaceStatus,
} from '../src/html.ts'

const statuses: SurfaceStatus[] = [
  { id: 'tau', label: 'Tau', state: 'ready' },
  {
    id: 'kappa',
    label: 'Kappa',
    state: 'ready',
    upstream: 'http://127.0.0.1:25159',
  },
  {
    id: 'kimi',
    label: 'Kimi',
    state: 'unavailable',
    upstream: 'http://127.0.0.1:25126',
    detail: 'The upstream did not answer: connect ECONNREFUSED',
  },
]

describe('renderLandingPage', () => {
  const html = renderLandingPage({
    statuses,

    token: 'gateway-token-value',
    origin: 'http://127.0.0.1:25230',
  })

  test('carries a pane per agent', () => {
    expect(html).toContain('id="pane-tau"')
    expect(html).toContain('id="pane-kappa"')
    expect(html).toContain('id="pane-kimi"')
  })

  test('carries the token so the browser can reach the surfaces', () => {
    expect(html).toContain('gateway-token-value')
  })

  test('lists the agent surfaces and their state', () => {
    expect(html).toContain('http://127.0.0.1:25159')
    expect(html).toContain('http://127.0.0.1:25126')
    expect(html).toContain('unavailable')
  })

  test('says plainly when a surface is down instead of faking a UI', () => {
    expect(html).toContain('surface unavailable')
    expect(html).toContain('The upstream did not answer')
  })
})

describe('escapeHtml', () => {
  test('neutralises markup in a label', () => {
    const hostile = renderUnavailablePage({
      surface: '<script>alert(1)</script>',
      detail: 'boom',
    })
    expect(hostile).not.toContain('<script>alert(1)</script>')
    expect(hostile).toContain('&lt;script&gt;')
  })

  test('escapes quotes so an attribute cannot be broken out of', () => {
    expect(escapeHtml('a"b\'c&d<e>f')).toBe('a&quot;b&#39;c&amp;d&lt;e&gt;f')
  })
})

describe('renderUnavailablePage', () => {
  test('names the surface and the upstream', () => {
    const html = renderUnavailablePage({
      surface: 'Kimi',
      upstream: 'http://127.0.0.1:25126',
      detail: 'The upstream did not answer.',
      hint: 'Start the kimi backend.',
    })
    expect(html).toContain('Kimi')
    expect(html).toContain('http://127.0.0.1:25126')
    expect(html).toContain('Start the kimi backend.')
  })
})

describe('renderTauShell', () => {
  test('embeds collab-web when it is configured', () => {
    const html = renderTauShell({
      collabUrl: 'http://127.0.0.1:3000',
      hosts: [],
      token: 'tok',
      origin: 'http://127.0.0.1:25230',
    })
    expect(html).toContain('src="http://127.0.0.1:3000"')
  })

  test('explains itself when collab-web is not configured', () => {
    const html = renderTauShell({
      hosts: [],
      token: 'tok',
      origin: 'http://127.0.0.1:25230',
    })
    expect(html).toContain('collab-web is not configured')
    expect(html).toContain('TAU_COLLAB_URL')
  })

  test('lists the live collab hosts', () => {
    const html = renderTauShell({
      hosts: [
        {
          instanceId: 'inst-1',
          sessionName: 'build',
          cwd: '/tmp',
          access: 'control',
        },
      ],
      token: 'tok',
      origin: 'http://127.0.0.1:25230',
    })
    expect(html).toContain('inst-1')
    expect(html).toContain('build')
    expect(html).toContain('/tmp')
  })

  test('says so when the registry could not be read', () => {
    const html = renderTauShell({
      hosts: [],
      hostsError: 'tau collab list exited with code 1',
      token: 'tok',
      origin: 'http://127.0.0.1:25230',
    })
    expect(html).toContain('Collab registry unavailable')
    expect(html).toContain('exited with code 1')
  })
})

describe('renderNotFoundPage', () => {
  test('echoes the path it could not route', () => {
    const html = renderNotFoundPage({ path: '/nope' })
    expect(html).toContain('/nope')
    expect(html).toContain('Not found')
  })
})
