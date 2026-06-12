// ============================================================
// integrations/whatsapp.js â WhatsApp Business (Meta Cloud API)
// ============================================================
// DocumentaciÃ³n oficial: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Cada "canal" guardado en canales_whatsapp representa un nÃºmero de WhatsApp
// Business distinto, con su propio phone_number_id y access_token (obtenidos
// desde Meta Business Manager / Developers App).
// ============================================================
const { db, uid } = require('../db');

const GRAPH_API_VERSION = 'v19.0';

function getCanal(canalId) {
  return db.prepare('SELECT * FROM canales_whatsapp WHERE id = ?').get(canalId);
}

// EnvÃ­a un mensaje de texto a travÃ©s de un nÃºmero configurado.
async function enviarMensaje(canalId, telefonoDestino, texto) {
  const canal = getCanal(canalId);
  if (!canal) return { enviado: false, detalle: 'Canal de WhatsApp no encontrado.' };
  if (!canal.access_token || !canal.phone_number_id) {
    return { enviado: false, detalle: 'Este canal aÃºn no tiene credenciales de Meta Cloud API configuradas (ver pestaÃ±a Canales).' };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${canal.phone_number_id}/messages`;
  const to = String(telefonoDestino || '').replace(/[^\d+]/g, '');

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${canal.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: texto }
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { enviado: false, detalle: `Meta API respondiÃ³ ${resp.status}: ${JSON.stringify(data)}` };
    }
    return { enviado: true, detalle: 'Mensaje enviado viá WhatsApp Cloud API', data };
  } catch (e) {
    return { enviado: false, detalle: 'Error de red al llamar a Meta API: ' + e.message };
  }
}

function verificarWebhook(canalId, query) {
  const canal = getCanal(canalId);
  if (!canal) return null;
  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token'] === canal.verify_token) {
    return query['hub.challenge'];
  }
  return null;
}

function procesarWebhook(canalId, payload) {
  const canal = getCanal(canalId);
  if (!canal) return { ok: false, error: 'Canal no encontrado' };

  const resultados = [];
  const entries = payload.entry || [];
  for (const entry of entries) {
    for (const change of (entry.changes || [])) {
      const value = change.value || {};
      const contactos = value.contacts || [];
      const mensajes = value.messages || [];
      for (const msg of mensajes) {
        const telefono = '+' + (msg.from || '').replace(/^\+/, '');
        const nombre = (contactos.find(c => c.wa_id === msg.from) || {}).profile?.name || telefono;
        const texto = msg.text?.body || `[mensaje tipo ${msg.type}]`;
        const fecha = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
        resultados.push(registrarMensajeEntrante({ canalId, telefono, nombre, texto, fecha }));
      }
    }
  }
  return { ok: true, procesados: resultados.length };
}

function registrarMensajeEntrante({ canalId, telefono, nombre, texto, fecha }) {
  const cliente = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(telefono);
  let conv = db.prepare(`SELECT * FROM conversaciones WHERE canal_tipo = 'whatsapp' AND canal_id = ? AND contacto_direccion = ?`).get(canalId, telefono);
  if (!conv) {
    const id = uid('cv');
    db.prepare(`INSERT INTO conversaciones (id, cliente_id, canal_tipo, canal_id, contacto_nombre, contacto_direccion, estado, updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, cliente ? cliente.id : null, 'whatsapp', canalId, nombre, telefono, 'Sin leer', fecha);
    conv = db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(id);
  } else {
    db.prepare('UPDATE conversaciones SET estado = ?, updated_at = ?, contacto_nombre = ? WHERE id = ?')
      .run('Sin leer', fecha, nombre, conv.id);
  }
  db.prepare('INSERT INTO mensajes (id, conversacion_id, de, texto, asunto, fecha, autor_id) VALUES (?,?,?,?,?,?,?)')
    .run(uid('m'), conv.id, 'cliente', texto, null, fecha, null);
  return conv.id;
}

module.exports = { enviarMensaje, verificarWebhook, procesarWebhook, registrarMensajeEntrante };
