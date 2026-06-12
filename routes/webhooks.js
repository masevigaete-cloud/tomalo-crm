// ============================================================
// routes/webhooks.js â Endpoints pÃºblicos para recibir mensajes
// ============================================================
// Estos endpoints NO requieren login (los llaman Meta / el proveedor de
// email), pero validan un token propio de cada canal.
// ============================================================
const { sendJson } = require('../lib/router');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const { db } = require('../db');

function register(router) {

  // --- WhatsApp: verificaciÃ³n (GET) ---
  router.get('/webhook/whatsapp/:canalId', async (req, res) => {
    const challenge = whatsapp.verificarWebhook(req.params.canalId, req.query);
    if (challenge !== null && challenge !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(String(challenge));
    }
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('VerificaciÃ³n fallida');
  });

  // --- WhatsApp: mensajes entrantes (POST) ---
  router.post('/webhook/whatsapp/:canalId', async (req, res) => {
    const result = whatsapp.procesarWebhook(req.params.canalId, req.body || {});
    sendJson(res, 200, result);
  });

  // --- Email: correo entrante (POST) ---
  // Formato esperado (genÃ©rico, ajustar segÃºn proveedor):
  // { secret, from: "Nombre <correo@dominio.com>", subject, text }
  router.post('/webhook/email/:canalId', async (req, res) => {
    const canal = email.getCanal(req.params.canalId);
    if (!canal) return sendJson(res, 404, { error: 'Canal no encontrado' });

    const b = req.body || {};
    if (canal.webhook_secret && b.secret !== canal.webhook_secret && req.query.secret !== canal.webhook_secret) {
      return sendJson(res, 401, { error: 'Secret de webhook invÃ¡lido' });
    }

    const fromRaw = b.from || b.sender || '';
    const match = fromRaw.match(/^(.*)<(.+)>$/);
    const deNombre = match ? match[1].trim() : fromRaw;
    const deEmail = match ? match[2].trim() : fromRaw;

    const convId = email.registrarCorreoEntrante(req.params.canalId, {
      deEmail, deNombre, asunto: b.subject || '(sin asunto)', texto: b.text || b.body || ''
    });

    sendJson(res, 200, { ok: true, conversacionId: convId });
  });

  // --- Endpoint de prueba: simular un mensaje entrante (Ãºtil para demo) ---
  router.post('/api/dev/simular-mensaje', async (req, res) => {
    const b = req.body || {};
    if (b.canalTipo === 'email') {
      const convId = email.registrarCorreoEntrante(b.canalId, {
        deEmail: b.de, deNombre: b.nombre || b.de, asunto: b.asunto || 'Consulta', texto: b.texto
      });
      return sendJson(res, 200, { ok: true, conversacionId: convId });
    }
    const convId = whatsapp.registrarMensajeEntrante({
      canalId: b.canalId, telefono: b.de, nombre: b.nombre || b.de, texto: b.texto, fecha: new Date().toISOString()
    });
    sendJson(res, 200, { ok: true, conversacionId: convId });
  });
}

module.exports = { register };
