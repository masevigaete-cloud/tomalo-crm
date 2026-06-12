// ============================================================
// auth.js â Sesiones, login y middlewares de autorizaciÃ³n
// ============================================================
const crypto = require('crypto');
const { db, uid, hashPassword, verifyPassword } = require('./db');
const { sendJson } = require('./lib/router');

const SESSION_DAYS = 7;

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, userId, now.toISOString(), expires.toISOString());
  return token;
}

function getUserByToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare('SELECT id, nombre, email, rol, activo FROM users WHERE id = ?').get(session.user_id);
  if (!user || !user.activo) return null;
  return user;
}

function extractToken(req) {
  const header = req.headers['authorization'] || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

// Middleware: requiere usuario autenticado -> req.user
async function requireAuth(req, res, params) {
  const token = extractToken(req);
  const user = getUserByToken(token);
  if (!user) {
    return sendJson(res, 401, { error: 'No autenticado' });
  }
  req.user = user;
}

// Middleware factory: requiere uno de los roles indicados
function requireRole(...roles) {
  return async function (req, res, params) {
    if (!req.user) return sendJson(res, 401, { error: 'No autenticado' });
    if (!roles.includes(req.user.rol)) {
      return sendJson(res, 403, { error: 'No tienes permisos para esta acciÃ³n' });
    }
  };
}

function login(email, password) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());
  if (!user || !user.activo) return null;
  if (!verifyPassword(password || '', user.password_salt, user.password_hash)) return null;
  const token = createSession(user.id);
  return { token, user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol } };
}

module.exports = { createSession, getUserByToken, requireAuth, requireRole, login, extractToken };
