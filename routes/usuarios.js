// ============================================================
// routes/usuarios.js â GestiÃ³n de usuarios (solo admin)
// ============================================================
const { db, uid, hashPassword } = require('../db');
const { sendJson } = require('../lib/router');

const ROLES = ['admin', 'comercial', 'agente'];

function register(router, { requireAuth, requireRole }) {

  router.get('/api/usuarios', requireAuth, requireRole('admin'), async (req, res) => {
    sendJson(res, 200, db.prepare('SELECT id, nombre, email, rol, activo, created_at FROM users ORDER BY created_at').all());
  });

  router.post('/api/usuarios', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.nombre || !b.email || !b.password) return sendJson(res, 400, { error: 'Nombre, email y contraseÃ±a son obligatorios' });
    if (!ROLES.includes(b.rol)) return sendJson(res, 400, { error: 'Rol invÃ¡lido. Usa: ' + ROLES.join(', ') });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(b.email.toLowerCase().trim());
    if (existing) return sendJson(res, 409, { error: 'Ya existe un usuario con ese email' });

    const id = uid('u');
    const { hash, salt } = hashPassword(b.password);
    db.prepare('INSERT INTO users (id, nombre, email, password_hash, password_salt, rol, activo, created_at) VALUES (?,?,?,?,?,?,1,?)')
      .run(id, b.nombre, b.email.toLowerCase().trim(), hash, salt, b.rol, new Date().toISOString());
    sendJson(res, 201, db.prepare('SELECT id, nombre, email, rol, activo, created_at FROM users WHERE id = ?').get(id));
  });

  router.put('/api/usuarios/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Usuario no encontrado' });
    const b = req.body || {};
    let { hash, salt } = { hash: row.password_hash, salt: row.password_salt };
    if (b.password) ({ hash, salt } = hashPassword(b.password));
    const rol = b.rol && ROLES.includes(b.rol) ? b.rol : row.rol;
    db.prepare('UPDATE users SET nombre=?, rol=?, activo=?, password_hash=?, password_salt=? WHERE id=?')
      .run(b.nombre ?? row.nombre, rol, b.activo === undefined ? row.activo : (b.activo ? 1 : 0), hash, salt, req.params.id);
    sendJson(res, 200, db.prepare('SELECT id, nombre, email, rol, activo, created_at FROM users WHERE id = ?').get(req.params.id));
  });

  router.delete('/api/usuarios/:id', requireAuth, requireRole('admin'), async (req, res) => {
    if (req.params.id === req.user.id) return sendJson(res, 400, { error: 'No puedes eliminar tu propio usuario' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register, ROLES };
