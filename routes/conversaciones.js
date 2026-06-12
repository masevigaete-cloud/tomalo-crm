// ============================================================
// routes/conversaciones.js
// ============================================================
const { db, uid } = require('../db');
const { sendJson } = require('../lib/router');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');

function withMensajes(conv) {
  conv.mensajes = db.prepare('SELECT * FROM mensajes WHERE conversacion_id = ? ORDER BY fecha ASC').all(conv.id);
  return conv;
}

function register(router, { requireAuth }) {

  router.get('/api/conversaciones', requireAuth, async (req, res) => {
    const rows = db.prepare(`
      SELECT c.*, (SELECT texto FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.fecha DESC LIMIT 1) AS ultimo_mensaje,
             (SELECT fecha FROM mensajes m WHERE m.conversacion_id = c.id ORDER BY m.fecha DESC LIMIT 1) AS ultima_fecha
      FROM conversaciones c
      ORDER BY updated_at DESC
    `).all();
    sendJson(res, 200, rows);
  });

  router.get('/api/conversaciones/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'ConversaciÃ³n no encontrada' });
    sendJson(res, 200, withMensajes(row));
  });

  // Marcar como atendido / cambiar cliente vinculado
  router.put('/api/conversaciones/:id', requireAuth, async (req, res) => {
    const row = db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(req.params.id);
    if (!row) return sendJson(res, 404, { error: 'ConversaciÃ³n no encontrada' });
    const b = req.body || {};
    db.prepare('UPDATE conversaciones SET estado=?, cliente_id=? WHERE id=?')
      .run(b.estado ?? row.estado, b.clienteId ?? row.cliente_id, req.params.id);
    sendJson(res, 200, withMensajes(db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(req.params.id)));
  });

  // Responder desde la bandeja (WhatsApp o Email real, segÃºn el canal de la conversaciÃ³n)
  router.post('/api/conversaciones/:id/mensajes', requireAuth, async (req, res) => {
    const conv = db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(req.params.id);
    if (!conv) return sendJson(res, 404, { error: 'ConversaciÃ³n no encontrada' });
    const b = req.body || {};
    const texto = (b.texto || '').trim();
    if (!texto) return sendJson(res, 400, { error: 'El mensaje no puede estar vacÃ­o' });
    const now = new Date().toISOString();

    let resultado = { enviado: false, detalle: 'Canal no configurado todavÃ­a.' };
    try {
      if (conv.canal_tipo === 'whatsapp') {
        resultado = await whatsapp.enviarMensaje(conv.canal_id, conv.contacto_direccion, texto);
      } else if (conv.canal_tipo === 'email') {
        resultado = await email.enviarCorreo(conv.canal_id, conv.contacto_direccion, b.asunto || 'Re: tu consulta', texto);
      }
    } catch (e) {
      resultado = { enviado: false, detalle: e.message };
    }

    db.prepare('INSERT INTO mensajes (id, conversacion_id, de, texto, asunto, fecha, autor_id) VALUES (?,?,?,?,?,?,?)')
      .run(uid('m'), conv.id, 'agente', texto, b.asunto || null, now, req.user.id);
    db.prepare('UPDATE conversaciones SET updated_at = ?, estado = ? WHERE id = ?').run(now, 'Atendido', conv.id);

    sendJson(res, 201, { mensaje: 'ok', envio: resultado, conversacion: withMensajes(db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(conv.id)) });
  });
}

module.exports = { register };
