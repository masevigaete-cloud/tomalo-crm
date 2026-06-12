// ============================================================
// routes/clientes.js
// ============================================================
const { db, uid } = require('../db');
const { sendJson } = require('../lib/router');

function rowToCliente(row) {
  return { ...row, etiquetas: JSON.parse(row.etiquetas || '[]') };
}

function register(router, { requireAuth }) {

  router.get('/api/clientes', requireAuth, async (req, res) => {
    const rows = db.prepare('SELECT * FROM clientes ORDER BY nombre').all();
    const clientes = rows.map(rowToCliente).map(c => {
      const numTickets = db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE cliente_id = ?').get(c.id).n;
      const numOps = db.prepare('SELECT COUNT(*) AS n FROM oportunidades WHERE cliente_id = ?').get(c.id).n;
      return { ...c, numTickets, numOps };
    });
    sendJson(res, 200, clientes);
  });

  router.get('/api/clientes/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Cliente no encontrado' });
    const cliente = rowToCliente(row);
    cliente.tickets = db.prepare('SELECT * FROM tickets WHERE cliente_id = ? ORDER BY fecha_creacion DESC').all(cliente.id);
    cliente.oportunidades = db.prepare('SELECT * FROM oportunidades WHERE cliente_id = ? ORDER BY fecha_creacion DESC').all(cliente.id);
    sendJson(res, 200, cliente);
  });

  router.post('/api/clientes', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.nombre) return sendJson(res, 400, { error: 'El nombre es obligatorio' });
    const id = uid('c');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO clientes (id, nombre, contacto, telefono, email, tipo, direccion, etiquetas, notas, fecha_alta, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.nombre, b.contacto || '', b.telefono || '', b.email || '', b.tipo || 'Empresa', b.direccion || '',
           JSON.stringify(b.etiquetas || []), b.notas || '', now.slice(0, 10), now);
    sendJson(res, 201, rowToCliente(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id)));
  });

  router.put('/api/clientes/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Cliente no encontrado' });
    const b = req.body || {};
    db.prepare(`UPDATE clientes SET nombre=?, contacto=?, telefono=?, email=?, tipo=?, direccion=?, etiquetas=?, notas=? WHERE id=?`)
      .run(b.nombre ?? row.nombre, b.contacto ?? row.contacto, b.telefono ?? row.telefono, b.email ?? row.email,
           b.tipo ?? row.tipo, b.direccion ?? row.direccion, JSON.stringify(b.etiquetas ?? JSON.parse(row.etiquetas || '[]')),
           b.notas ?? row.notas, req.params.id);
    sendJson(res, 200, rowToCliente(db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id)));
  });

  router.delete('/api/clientes/:id', requireAuth, async (req, res) => {
    db.prepare('UPDATE tickets SET cliente_id = NULL WHERE cliente_id = ?').run(req.params.id);
    db.prepare('UPDATE oportunidades SET cliente_id = NULL WHERE cliente_id = ?').run(req.params.id);
    db.prepare('UPDATE conversaciones SET cliente_id = NULL WHERE cliente_id = ?').run(req.params.id);
    db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
