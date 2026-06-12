// ============================================================
// routes/canales.js â ConfiguraciÃ³n de nÃºmeros de WhatsApp y cuentas de email
// ============================================================
const { db, uid } = require('../db');
const { sendJson } = require('../lib/router');

// Oculta secretos para usuarios no-admin
function maskWsp(row, isAdmin) {
  const out = { ...row };
  if (!isAdmin) {
    out.access_token = out.access_token ? 'â¢â¢â¢â¢â¢â¢â¢â¢' : '';
    out.verify_token = out.verify_token ? 'â¢â¢â¢â¢â¢â¢â¢â¢' : '';
  }
  return out;
}
function maskEmail(row, isAdmin) {
  const out = { ...row };
  if (!isAdmin) {
    out.api_key = out.api_key ? 'â¢â¢â¢â¢â¢â¢â¢â¢' : '';
    out.webhook_secret = out.webhook_secret ? 'â¢â¢â¢â¢â¢â¢â¢â¢' : '';
  }
  return out;
}

function register(router, { requireAuth, requireRole }) {

  // ---------- WhatsApp ----------
  router.get('/api/canales/whatsapp', requireAuth, async (req, res) => {
    const rows = db.prepare('SELECT * FROM canales_whatsapp ORDER BY created_at').all();
    sendJson(res, 200, rows.map(r => maskWsp(r, req.user.rol === 'admin')));
  });

  router.post('/api/canales/whatsapp', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.nombre) return sendJson(res, 400, { error: 'El nombre es obligatorio' });
    const id = uid('cw');
    db.prepare(`INSERT INTO canales_whatsapp (id, nombre, telefono, phone_number_id, waba_id, access_token, verify_token, activo, created_at)
                VALUES (?,?,?,?,?,?,?,1,?)`)
      .run(id, b.nombre, b.telefono || '', b.phoneNumberId || '', b.wabaId || '', b.accessToken || '', b.verifyToken || uid('vt'), new Date().toISOString());
    sendJson(res, 201, db.prepare('SELECT * FROM canales_whatsapp WHERE id = ?').get(id));
  });

  router.put('/api/canales/whatsapp/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const row = db.prepare('SELECT * FROM canales_whatsapp WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Canal no encontrado' });
    const b = req.body || {};
    db.prepare(`UPDATE canales_whatsapp SET nombre=?, telefono=?, phone_number_id=?, waba_id=?, access_token=?, verify_token=?, activo=? WHERE id=?`)
      .run(b.nombre ?? row.nombre, b.telefono ?? row.telefono, b.phoneNumberId ?? row.phone_number_id,
           b.wabaId ?? row.waba_id, b.accessToken ?? row.access_token, b.verifyToken ?? row.verify_token,
           b.activo === undefined ? row.activo : (b.activo ? 1 : 0), req.params.id);
    sendJson(res, 200, db.prepare('SELECT * FROM canales_whatsapp WHERE id = ?').get(req.params.id));
  });

  router.delete('/api/canales/whatsapp/:id', requireAuth, requireRole('admin'), async (req, res) => {
    db.prepare('DELETE FROM canales_whatsapp WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });

  // ---------- Email ----------
  router.get('/api/canales/email', requireAuth, async (req, res) => {
    const rows = db.prepare('SELECT * FROM canales_email ORDER BY created_at').all();
    sendJson(res, 200, rows.map(r => maskEmail(r, req.user.rol === 'admin')));
  });

  router.post('/api/canales/email', requireAuth, requireRole('admin'), async (req, res) => {
    const b = req.body || {};
    if (!b.nombre || !b.direccion) return sendJson(res, 400, { error: 'Nombre y direcciÃ³n son obligatorios' });
    const id = uid('ce');
    db.prepare(`INSERT INTO canales_email (id, nombre, direccion, proveedor, api_key, dominio, webhook_secret, activo, created_at)
                VALUES (?,?,?,?,?,?,?,1,?)`)
      .run(id, b.nombre, b.direccion, b.proveedor || 'resend', b.apiKey || '', b.dominio || '', b.webhookSecret || uid('whs'), new Date().toISOString());
    sendJson(res, 201, db.prepare('SELECT * FROM canales_email WHERE id = ?').get(id));
  });

  router.put('/api/canales/email/:id', requireAuth, requireRole('admin'), async (req, res) => {
    const row = db.prepare('SELECT * FROM canales_email WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Canal no encontrado' });
    const b = req.body || {};
    db.prepare(`UPDATE canales_email SET nombre=?, direccion=?, proveedor=?, api_key=?, dominio=?, webhook_secret=?, activo=? WHERE id=?`)
      .run(b.nombre ?? row.nombre, b.direccion ?? row.direccion, b.proveedor ?? row.proveedor,
           b.apiKey ?? row.api_key, b.dominio ?? row.dominio, b.webhookSecret ?? row.webhook_secret,
           b.activo === undefined ? row.activo : (b.activo ? 1 : 0), req.params.id);
    sendJson(res, 200, db.prepare('SELECT * FROM canales_email WHERE id = ?').get(req.params.id));
  });

  router.delete('/api/canales/email/:id', requireAuth, requireRole('admin'), async (req, res) => {
    db.prepare('DELETE FROM canales_email WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
