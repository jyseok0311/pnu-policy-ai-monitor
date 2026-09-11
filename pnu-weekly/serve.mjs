// dist/ 를 그냥 띄우는 정적 서버. 검수용이며 배포에는 쓰지 않는다(배포는 GitHub Pages).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'dist');
const TYPE = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf' };

createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const rel = normalize(p === '/' ? 'index.html' : p.replace(/^\/+/, ''));
    if (rel.startsWith('..')) { res.writeHead(403).end('forbidden'); return; }
    const buf = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': TYPE[extname(rel)] || 'application/octet-stream' }).end(buf);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
}).listen(8765, () => console.log('http://localhost:8765'));
