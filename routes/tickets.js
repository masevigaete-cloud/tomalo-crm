// ============================================================
// routes/tickets.js
// ============================================================
const { db, uid } = require('../db');
const { sendJson } = require('../lib/router');

function withNotas(ticket) {
  ticket.notas = db.prepare('SELECT * FROM ticket_notas WHERE ticket_id = ? ORDER BY fecha ASC').all(ticket.id);
  return ticket;
}

function register(router, { requireAuth }) {

  router.get('/api/tickets', requireAuth, async (req, res) => {
    const rows = db.prepare('SELECT * FROM tickets ORDER BY fecha_creacion DESC').all();
    sendJson(res, 200, rows.map(withNotas));
  });

  router.get('/api/tickets/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Ticket no encontrado' });
    sendJson(res, 200, withNotas(row));
  });

  router.post('/api/tickets', requireAuth, async (req, res) => {
    const b = req.body || {};
    const id = uid('t');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO tickets (id, cliente_id, contacto_nombre, telefono, canal_tipo, canal_id, categoria, prioridad, estado, asignado_a, mensaje_original, fecha_creacion, fecha_actualizacion)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.clienteId || null, b.contactoNombre || '', b.telefono || '', b.canalTipo || 'manual', b.canalId || null,
           b.categoria || 'Otro', b.prioridad || 'Media', 'Nuevo', b.asignadoA || null, b.mensajeOriginal || '', now, now);
    sendJson(res, 201, withNotas(db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)));
  });

  router.put('/api/tickets/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Ticket no encontrado' });
    const b = req.body || {};
    const now = new Date().toISOString();
    db.prepare(`UPDATE tickets SET cliente_id=?, contacto_nombre=?, telefono=?, categoria=?, prioridad=?, estado=?, asignado_a=?, fecha_actualizacion=? WHERE id=?`)
      .run(b.clienteId ?? row.cliente_id, b.contactoNombre ?? row.contacto_nombre, b.telefono ?? row.telefono,
           b.categoria ?? row.categoria, b.prioridad ?? row.prioridad, b.estado ?? row.estado,
           b.asignadoA ?? row.asignado_a, now, req.params.id);

    if (b.nuevaNota && b.nuevaNota.trim()) {
      db.prepare('INSERT INTO ticket_notas (id, ticket_id, autor, texto, fecha) VALUES (?,?,?,?,?)')
        .run(uid('n'), req.params.id, req.user.nombre, b.nuevaNota.trim(), now);
    }

    sendJson(res, 200, withNotas(db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)));
  });

  router.delete('/api/tickets/:id', requireAuth, async (req, res) => {
    db.prepare('DELETE FROM tickets WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
