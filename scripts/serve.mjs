import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };

export function serve(port = 8080) {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const path = resolve(root, name);
      if (!path.startsWith(root + sep) || !(name === 'index.html' || name.startsWith('assets/'))) {
        response.writeHead(404).end();
        return;
      }
      const content = await readFile(path);
      response.writeHead(200, { 'Content-Type': `${mime[extname(path)] || 'application/octet-stream'}`, 'Cache-Control': 'no-store' });
      response.end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = await serve(Number(process.env.PORT) || 8080);
  console.log(`Font Fourier: http://127.0.0.1:${server.address().port}`);
}
