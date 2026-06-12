// ============================================================
// router.js â Mini router HTTP (sin dependencias externas)
// ============================================================

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, ...handlers) {
    const keys = [];
    const regexStr = pattern
      .replace(/\/$/, '')
      .replace(/:[A-Za-z0-9_]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; });
    const regex = new RegExp('^' + (regexStr || '/') + '/?$');
    this.routes.push({ method, regex, keys, handlers });
  }

  get(p, ...h) { this.add('GET', p, ...h); }
  post(p, ...h) { this.add('POST', p, ...h); }
  put(p, ...h) { this.add('PUT', p, ...h); }
  patch(p, ...h) { this.add('PATCH', p, ...h); }
  delete(p, ...h) { this.add('DELETE', p, ...h); }

  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;

      const params = {};
      route.keys.forEach((key, i) => { params[key] = match[i + 1]; });
      req.params = params;
      req.query = Object.fromEntries(url.searchParams.entries());

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body = await parseBody(req);
      } else {
        req.body = {};
      }

      try {
        for (const handler of route.handlers) {
          await handler(req, res, params);
          if (res.writableEnded) return true;
        }
      } catch (err) {
        console.error('Error en handler:', err);
        if (!res.headersSent) sendJson(res, 500, { error: 'Error interno del servidor', detail: err.message });
      }
      return true;
    }
    return false;
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        const ct = req.headers['content-type'] || '';
        if (ct.includes('application/json')) {
          resolve(JSON.parse(raw));
        } else {
          resolve({});
        }
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res, status, data) {
  if (res.writableEnded) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

module.exports = { Router, sendJson, parseBody };
