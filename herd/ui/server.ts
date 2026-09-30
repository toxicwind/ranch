// herd/ui/server.ts — serves the ranch console + proxies rig (OpenFang kernel) API.
const KERNEL = 'http://127.0.0.1:25196';
const PORT = 25200;
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/rig/')) {
      const target = KERNEL + '/api/' + url.pathname.slice('/api/rig/'.length) + url.search;
      const res = await fetch(target, {
        method: req.method,
        headers: { 'Content-Type': 'application/json' },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text(),
      });
      return new Response(await res.arrayBuffer(), {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/json' },
      });
    }
    const p = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file('dist' + p);
    if (await file.exists()) {
      const ct = p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html';
      return new Response(file, { headers: { 'Content-Type': ct } });
    }
    return new Response(Bun.file('dist/index.html'), { headers: { 'Content-Type': 'text/html' } });
  },
});
console.log('ranch console on :' + PORT + ' -> kernel ' + KERNEL);
