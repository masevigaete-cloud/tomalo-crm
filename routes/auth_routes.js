// ============================================================
// routes/auth_routes.js
// ============================================================
const { sendJson } = require('../lib/router');
const { login, getUserByToken, extractToken } = require('../auth');
const { db } = require('../db');

function register(router, { requireAuth }) {

  router.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const result = login(email, password);
    if (!result) return sendJson(res, 401, { error: 'Email o contraseÃ±a incorrectos' });
    sendJson(res, 200, result);
  });

  router.get('/api/auth/me', requireAuth, async (req, res) => {
    sendJson(res, 200, { user: req.user });
  });

  router.post('/api/auth/logout', requireAuth, async (req, res) => {
    const token = extractToken(req);
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
