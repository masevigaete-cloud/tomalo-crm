// ============================================================
// server.js â Punto de entrada (Node.js puro, sin dependencias)
// ============================================================
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Router } = require('./lib/router');
const { requireAuth, requireRole } = require('./auth');
const { seed } = require('./db');

// Si la base de datos estÃ¡ vacÃ­a, la poblamos con datos de ejemplo
seed();

const router = new Router();

require('./routes/auth_routes').register(router, { requireAuth });
require('./routes/usuarios').register(router, { requireAuth, requireRole });
require('./routes/clientes').register(router, { requireAuth });
require('./routes/tickets').register(router, { requireAuth });
require('./routes/oportunidades').register(router, { requireAuth });
require('./routes/conversaciones').register(router, { requireAuth });
require('./routes/canales').register(router, { requireAuth, requireRole });
require('./routes/dashboard').register(router, { requireAuth });
require('./routes/webhooks').register(router);

// ------------------------------------------------------------
// Archivos estÃ¡ticos (frontend en /public)
// ------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.join(PUBLIC_DIR, pathname);
  // Evitar path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Prohibido');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback -> index.html
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexData) => {
        if (err2) { res.writeHead(404); return res.end('No encontrado'); }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ------------------------------------------------------------
// Servidor HTTP
// ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    const handled = await router.handle(req, res);
    if (handled) return;
  } catch (e) {
    console.error(e);
  }
  if (req.url.startsWith('/api/') || req.url.startsWith('/webhook/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Ruta no encontrada' }));
  }
  serveStatic(req, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Tomalo CRM corriendo en http://localhost:${PORT}`);
});
