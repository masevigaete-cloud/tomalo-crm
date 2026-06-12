// ============================================================
// integrations/email.js â Correo entrante/saliente vÃ­a API (sin SMTP/IMAP)
// ============================================================
// Soporta como proveedor de ENVÃO: Resend (https://resend.com) o
// SendGrid (https://sendgrid.com). Para RECEPCIÃN se usa el webhook de
// "inbound parsing" del proveedor (Resend Inbound, Mailgun Routes, etc.)
// que hace POST a /webhook/email/:canalId con el correo recibido.
// ============================================================
const { db, uid } = require('../db');

function getCanal(canalId) {
  return db.prepare('SELECT * FROM canales_email WHERE id = ?').get(canalId);
}

// EnvÃ­a un correo usando el proveedor configurado en el canal.
async function enviarCorreo(canalId, destinatario, asunto, texto) {
  const canal = getCanal(canalId);
  if (!canal) return { enviado: false, detalle: 'Canal de email no encontrado.' };
  if (!canal.api_key) {
    return { enviado: false, detalle: 'Este canal aÃºn no tiene API key configurada (ver pestaÃ±a Canales).' };
  }

  try {
    if (canal.proveedor === 'sendgrid') {
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${canal.api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: destinatario }] }],
          from: { email: canal.direccion, name: canal.nombre },
          subject: asunto,
          content: [{ type: 'text/plain', value: texto }]
        })
      });
      if (!resp.ok) {
        const data = await resp.text().catch(() => '');
        return { enviado: false, detalle: `SendGrid respondiÃ³ ${resp.status}: ${data}` };
      }
      return { enviado: true, detalle: 'Correo enviado vÃ­a SendGrid' };
    }

    if (canal.proveedor === 'mailgun') {
      if (!canal.dominio) return { enviado: false, detalle: 'Falta configurar el dominio de Mailgun.' };
      const form = new URLSearchParams();
      form.set('from', `${canal.nombre} <${canal.direccion}>`);
      form.set('to', destinatario);
      form.set('subject', asunto);
      form.set('text', texto);
      const resp = await fetch(`https://api.mailgun.net/v3/${canal.dominio}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`api:${canal.api_key}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: form
      });
      if (!resp.ok) {
        const data = await resp.text().catch(() => '');
        return { enviado: false, detalle: `Mailgun respondiÃ³ ${resp.status}: ${data}` };
      }
      return { enviado: true, detalle: 'Correo enviado viá Mailgun' };
    }

    // Por defecto: Resend
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${canal.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${canal.nombre} <${canal.direccion}>`,
        to: [destinatario],
        subject: asunto,
        text: texto
      })
    });
    if (!resp.ok) {
      const data = await resp.text().catch(() => '');
      return { enviado: false, detalle: `Resend respondio ${resp.status}: ${data}` };
    }
    return { enviado: true, detalle: 'Correo enviado viá Resend' };

  } catch (e) {
    return { enviado: false, detalle: 'Error de red al llamar a la API de correo: ' + e.message };
  }
}

// Procesa un correo entrante recibido viá webhook del proveedor.
// payload esperado (normalizado): { de_email, de_nombre, asunto, texto }
function registrarCorreoEntrante(canalId, { deEmail, deNombre, asunto, texto, fecha }) {
  fecha = fecha || new Date().toISOString();
  const cliente = db.prepare('SELECT id FROM clientes WHERE email = ?').get(deEmail);

  let conv = db.prepare(`SELECT * FROM conversaciones WHERE canal_tipo = 'email' AND canal_id = ? AND contacto_direccion = ?`).get(canalId, deEmail);
  if (!conv) {
    const id = uid('cv');
    db.prepare(`INSERT INTO conversaciones (id, cliente_id, canal_tipo, canal_id, contacto_nombre, contacto_direccion, estado, updated_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, cliente ? cliente.id : null, 'email', canalId, deNombre || deEmail, deEmail, 'Sin leer', fecha);
    conv = db.prepare('SELECT * FROM conversaciones WHERE id = ?').get(id);
  } else {
    db.prepare('UPDATE conversaciones SET estado = ?, updated_at = ?, contacto_nombre = ? WHERE id = ?')
      .run('Sin leer', fecha, deNombre || deEmail, conv.id);
  }

  db.prepare('INSERT INTO mensajes (id, conversacion_id, de, texto, asunto, fecha, autor_id) VALUES (?,?,?,?,?,?,?)')
    .run(uid('m'), conv.id, 'cliente', texto, asunto || null, fecha, null);

  return conv.id;
}

module.exports = { enviarCorreo, registrarCorreoEntrante, getCanal };
