/**
 * chats-gateway — the pages the gateway renders itself.
 *
 * Three kinds of page live here:
 *
 *   - the landing page (`/`): the unified shell with one tab per agent and a
 *     live availability strip. This is the page that replaced the prototype's
 *     two-tab "Tau Web" shell — the prototype had Kimi + Collab, this one has
 *     Tau + Kappa + Kimi.
 *   - the tau shell (`/tau/`): collab-web plus the local collab registry.
 *   - the honest failure pages: when an upstream is down the gateway says so
 *     in plain words, naming the surface and the upstream. It never renders a
 *     fake UI and never leaks a stack trace to the browser.
 */

import type { SurfaceId } from './surfaces.ts'

export type SurfaceState = 'ready' | 'unavailable' | 'unknown'

export interface SurfaceStatus {
  id: SurfaceId
  label: string
  state: SurfaceState
  /** Where the surface lives upstream, when it has an upstream. */
  upstream?: string
  /** Why it is unavailable, in plain words. */
  detail?: string
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, sans-serif; }
body { display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  border-bottom: 1px solid #8884; flex-wrap: wrap; }
header h1 { font-size: 15px; margin: 0 12px 0 0; font-weight: 600; }
.tab { border: 1px solid #8886; background: transparent; color: inherit;
  padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 14px; }
.tab.active { background: #8883; font-weight: 600; }
.tab[disabled] { opacity: .45; cursor: not-allowed; }
main { flex: 1; min-height: 0; }
.pane { display: none; height: 100%; }
.pane.active { display: block; }
iframe { width: 100%; height: 100%; border: 0; background: transparent; }
.card { padding: 24px; max-width: 780px; }
.card h2 { margin: 0 0 8px; font-size: 18px; }
.card p { line-height: 1.5; }
code { background: #8882; padding: 1px 6px; border-radius: 4px; }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px;
  border: 1px solid #8886; font-size: 12px; margin-left: 8px; }
.badge.ready { border-color: #4a4; color: #4a4; }
.badge.unavailable { border-color: #c66; color: #c66; }
.badge.unknown { border-color: #8888; color: #8888; }
table { border-collapse: collapse; width: 100%; margin-top: 12px; }
th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid #8883;
  font-size: 14px; vertical-align: top; }
th { font-weight: 600; }
ul { line-height: 1.6; }
`

function statusBadge(status: SurfaceStatus): string {
  return `<span class="badge ${status.state}">${escapeHtml(status.state)}</span>`
}

function statusRows(statuses: SurfaceStatus[]): string {
  const rows = statuses
    .map(
      (status) => `<tr>
  <td><a href="${escapeHtml(status.id === 'tau' ? '/tau/' : `/${status.id}/`)}">${escapeHtml(status.label)}</a>${statusBadge(status)}</td>
  <td>${status.upstream ? `<code>${escapeHtml(status.upstream)}</code>` : '<em>rendered by the gateway</em>'}</td>
  <td>${status.detail ? escapeHtml(status.detail) : '&nbsp;'}</td>
</tr>`
    )
    .join('\n')
  return `<table>
<thead><tr><th>Agent</th><th>Upstream</th><th>State</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>`
}

function paneFor(status: SurfaceStatus, body: string): string {
  return `<div class="pane" id="pane-${escapeHtml(status.id)}">${body}</div>`
}

/**
 * The unified shell: one tab per agent plus a live availability table.
 *
 * `token` is embedded in the iframe URLs because a browser cannot attach an
 * `Authorization` header to a navigation. The token is a loopback-scoped
 * credential for this gateway only.
 */
export function renderLandingPage(opts: {
  statuses: SurfaceStatus[]
  token: string
  /** Absolute origin the gateway is reachable at, e.g. `http://127.0.0.1:25230`. */
  origin: string
}): string {
  const query = `?token=${encodeURIComponent(opts.token)}`
  const panes = opts.statuses
    .map((status) => {
      const entry = status.id === 'tau' ? '/tau/' : `/${status.id}/`
      let body: string
      if (status.state === 'ready') {
        body = `<iframe src="${escapeHtml(entry + query)}" title="${escapeHtml(status.label)}"></iframe>`
      } else {
        body = `<div class="card">
  <h2>${escapeHtml(status.label)} — surface unavailable</h2>
  <p>${escapeHtml(status.detail ?? 'The upstream did not answer.')}</p>
  <p>Open the tab directly: <a href="${escapeHtml(entry + query)}">${escapeHtml(entry)}</a></p>
</div>`
      }
      return paneFor(status, body)
    })
    .join('\n')

  const tabs = opts.statuses
    .map(
      (status, index) =>
        `<button class="tab${index === 0 ? ' active' : ''}" data-pane="${escapeHtml(status.id)}">${escapeHtml(status.label)}</button>`
    )
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Chats Gateway</title>
<style>${STYLES}</style>
</head>
<body>
<header>
<h1>Chats Gateway</h1>
${tabs}
</header>
<main>
${panes}
<div class="pane" id="pane-statuses">
  <div class="card">
    <h2>Agent surfaces</h2>
    <p>One gateway, one loopback port, one token. Each tab proxies to the agent's own web surface.</p>
    ${statusRows(opts.statuses)}
  </div>
</div>
</main>
<script>
document.querySelectorAll('.tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    var pane = document.getElementById('pane-' + btn.dataset.pane);
    if (pane) pane.classList.add('active');
  });
});
</script>
</body>
</html>`
}

export interface CollabHost {
  instanceId?: string
  sessionName?: string
  sessionId?: string
  cwd?: string
  pid?: number
  access?: string
}

/**
 * The tau shell: collab-web next to the local collab registry.
 *
 * When no collab-web URL is configured the page says so and explains how to
 * host a session — it does not render an empty fake client.
 */
export function renderTauShell(opts: {
  collabUrl?: string
  hosts: CollabHost[]
  hostsError?: string
  token: string
  origin: string
}): string {
  const collabPane = opts.collabUrl
    ? `<iframe src="${escapeHtml(opts.collabUrl)}" title="Tau collab-web"></iframe>`
    : `<div class="card">
  <h2>collab-web is not configured</h2>
  <p>No collab-web client is registered with this gateway. Host a session from any tau instance
  with <code>/collab</code>, then open
  <a href="https://my.tau.sh" target="_blank" rel="noopener">my.tau.sh</a> and paste the link —
  or set <code>TAU_COLLAB_URL</code> to embed the client here.</p>
</div>`

  const hostsBody = opts.hostsError
    ? `<div class="card">
  <h2>Collab registry unavailable</h2>
  <p>${escapeHtml(opts.hostsError)}</p>
</div>`
    : opts.hosts.length === 0
      ? `<div class="card">
  <h2>No live collab hosts</h2>
  <p>No tau instance is currently hosting a collab session on this box. Run <code>/collab</code>
  in a tau session to publish one.</p>
</div>`
      : `<div class="card">
  <h2>Live collab hosts</h2>
  <ul>
${opts.hosts
  .map(
    (
      host
    ) => `  <li><code>${escapeHtml(host.instanceId ?? host.sessionId ?? 'unknown')}</code>
  ${escapeHtml(host.sessionName ?? '')}${host.cwd ? ` — <code>${escapeHtml(host.cwd)}</code>` : ''}
  ${host.access ? `<span class="badge">${escapeHtml(host.access)}</span>` : ''}</li>`
  )
  .join('\n')}
  </ul>
  <p>Get a control link with <code>tau collab link &lt;instanceId|pid&gt;</code>.</p>
</div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tau — Chats Gateway</title>
<style>${STYLES}</style>
</head>
<body>
<header>
<h1>Tau</h1>
<button class="tab active" data-pane="collab">collab-web</button>
<button class="tab" data-pane="hosts">collab hosts</button>
</header>
<main>
<div class="pane active" id="pane-collab">${collabPane}</div>
<div class="pane" id="pane-hosts">${hostsBody}</div>
</main>
<script>
document.querySelectorAll('.tab').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    var pane = document.getElementById('pane-' + btn.dataset.pane);
    if (pane) pane.classList.add('active');
  });
});
</script>
</body>
</html>`
}

/**
 * The honest failure page.
 *
 * Says which surface failed, which upstream was tried, and what the failure
 * was — in words a human can act on.
 */
export function renderUnavailablePage(opts: {
  surface: string
  upstream?: string
  detail: string
  hint?: string
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.surface)} — surface unavailable</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<div class="card">
  <h2>${escapeHtml(opts.surface)} — surface unavailable</h2>
  <p>${escapeHtml(opts.detail)}</p>
  ${opts.upstream ? `<p>Upstream: <code>${escapeHtml(opts.upstream)}</code></p>` : ''}
  ${opts.hint ? `<p>${escapeHtml(opts.hint)}</p>` : ''}
  <p><a href="/">Back to the gateway</a></p>
</div>
</main>
</body>
</html>`
}

/** The honest 404 page. */
export function renderNotFoundPage(opts: { path: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Not found — Chats Gateway</title>
<style>${STYLES}</style>
</head>
<body>
<main>
<div class="card">
  <h2>Not found</h2>
  <p>No surface answers <code>${escapeHtml(opts.path)}</code>.</p>
  <p><a href="/">Back to the gateway</a></p>
</div>
</main>
</body>
</html>`
}
