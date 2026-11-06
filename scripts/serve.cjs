// Local-only static preview for development and browser tests.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/script.js': ['script.js', 'text/javascript'], '/data.js': ['data.js', 'text/javascript'] };
http.createServer((request, response) => {
  const file = files[request.url.split('?')[0]];
  if (!file || !['GET', 'HEAD'].includes(request.method)) { response.writeHead(404); response.end('Not found'); return; }
  fs.readFile(path.join(__dirname, '..', 'dist', file[0]), (error, bytes) => {
    if (error) { response.writeHead(500); response.end('Run npm run build first.'); return; }
    response.writeHead(200, { 'Content-Type': file[1] + '; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  });
}).listen(8080, '127.0.0.1', () => console.log('Dashboard: http://127.0.0.1:8080'));
