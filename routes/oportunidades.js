// ============================================================
// routes/oportunidades.js
// ============================================================
const { db, uid } = require('../db');
const { sendJson } = require('../lib/router');

function register(router, { requireAuth }) {

  router.get('/api/oportunidades', requireAuth, async (req, res) => {
    sendJson(res, 200, db.prepare('SELECT * FROM oportunidades ORDER BY fecha_creacion DESC').all());
  });

  router.post('/api/oportunidades', requireAuth, async (req, res) => {
    const b = req.body || {};
    if (!b.titulo) return sendJson(res, 400, { error: 'El tÃ­tulo es obligatorio' });
    const id = uid('o');
    db.prepare(`INSERT INTO oportunidades (id, cliente_id, titulo, valor, etapa, probabilidad, responsable, fecha_creacion, fecha_cierre_estimada, notas)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, b.clienteId || null, b.titulo, Number(b.valor || 0), b.etapa || 'Prospecto', Number(b.probabilidad || 20),
           b.responsable || req.user.nombre, new Date().toISOString().slice(0, 10), b.fechaCierreEstimada || '', b.notas || '');
    sendJson(res, 201, db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(id));
  });

  router.put('/api/oportunidades/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'Oportunidad no encontrada' });
    const b = req.body || {};
    let etapa = b.etapa ?? row.etapa;
    let prob = b.probabilidad ?? row.probabilidad;
    if (etapa === 'Ganado') prob = 100;
    if (etapa === 'Perdido') prob = 0;
    db.prepare(`UPDATE oportunidades SET cliente_id=?, titulo=?, valor=?, etapa=?, probabilidad=?, responsable=?, fecha_cierre_estimada=?, notas=? WHERE id=?`)
      .run(b.clienteId ?? row.cliente_id, b.titulo ?? row.titulo, Number(b.valor ?? row.valor), etapa, Number(prob),
           b.responsable ?? row.responsable, b.fechaCierreEstimada ?? row.fecha_cierre_estimada, b.notas ?? row.notas, req.params.id);
    sendJson(res, 200, db.prepare('SELECT * FROM oportunidades WHERE id = ?').get(req.params.id));
  });

  router.delete('/api/oportunidades/:id', requireAuth, async (req, res) => {
    db.prepare('DELETE FROM oportunidades WHERE id = ?').run(req.params.id);
    sendJson(res, 200, { ok: true });
  });
}

module.exports = { register };
