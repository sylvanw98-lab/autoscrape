import http from 'node:http';

const paths = new Set(['/', '/api/dashboard', '/api/collection-log', '/api/auto-collection']);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!['GET', 'HEAD'].includes(req.method) || !paths.has(url.pathname)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 8787, path: url.pathname + url.search, method: req.method,
    headers: { host: '127.0.0.1:8787', accept: req.headers.accept || '*/*', 'x-dashboard-readonly': '1' } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('本地服务未启动'); });
  upstream.end();
}).listen(8788, '0.0.0.0', () => console.log('局域网只读看板已启动：8788'));
