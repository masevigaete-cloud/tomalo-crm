// ============================================================
// db.js â Base de datos (SQLite embebido en Node, sin dependencias)
// ============================================================
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'tomalo.db');

// Asegurar carpeta data/
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

// ------------------------------------------------------------
// ESQUEMA
// ------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'agente', -- admin | comercial | agente
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Canales de WhatsApp Business (uno o varios nÃºmeros, vÃ­a Meta Cloud API)
CREATE TABLE IF NOT EXISTS canales_whatsapp (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,            -- etiqueta interna, ej "AtenciÃ³n Norte"
  telefono TEXT,                   -- nÃºmero visible
  phone_number_id TEXT,            -- ID de Meta (Cloud API)
  waba_id TEXT,                    -- WhatsApp Business Account ID
  access_token TEXT,               -- token permanente de Meta
  verify_token TEXT,               -- token de verificaciÃ³n del webhook
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Cuentas de correo (envÃ­o vÃ­a API de proveedor + recepciÃ³n vÃ­a webhook)
CREATE TABLE IF NOT EXISTS canales_email (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,            -- etiqueta interna, ej "Soporte"
  direccion TEXT NOT NULL,         -- ej soporte@tomalo.cl
  proveedor TEXT NOT NULL DEFAULT 'resend', -- resend | sendgrid | mailgun
  api_key TEXT,
  dominio TEXT,                    -- requerido por mailgun
  webhook_secret TEXT,             -- para validar webhooks entrantes
  activo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  tipo TEXT DEFAULT 'Empresa',
  direccion TEXT,
  etiquetas TEXT DEFAULT '[]',     -- JSON array
  notas TEXT,
  fecha_alta TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  cliente_id TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  contacto_nombre TEXT,
  telefono TEXT,
  canal_tipo TEXT DEFAULT 'whatsapp',  -- whatsapp | email | manual
  canal_id TEXT,                       -- id del canal_whatsapp o canal_email
  categoria TEXT,
  prioridad TEXT DEFAULT 'Media',
  estado TEXT DEFAULT 'Nuevo',
  asignado_a TEXT REFERENCES users(id) ON DELETE SET NULL,
  mensaje_original TEXT,
  fecha_creacion TEXT NOT NULL,
  fecha_actualizacion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_notas (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor TEXT,
  texto TEXT NOT NULL,
  fecha TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oportunidades (
  id TEXT PRIMARY KEY,
  cliente_id TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  valor REAL DEFAULT 0,
  etapa TEXT DEFAULT 'Prospecto',
  probabilidad INTEGER DEFAULT 20,
  responsable TEXT,
  fecha_creacion TEXT NOT NULL,
  fecha_cierre_estimada TEXT,
  notas TEXT
);

-- Conversaciones unificadas (whatsapp o email)
CREATE TABLE IF NOT EXISTS conversaciones (
  id TEXT PRIMARY KEY,
  cliente_id TEXT REFERENCES clientes(id) ON DELETE SET NULL,
  canal_tipo TEXT NOT NULL,         -- whatsapp | email
  canal_id TEXT,                    -- canal_whatsapp.id o canal_email.id
  contacto_nombre TEXT,
  contacto_direccion TEXT,          -- telÃ©fono o email del cliente
  estado TEXT DEFAULT 'Sin leer',   -- Sin leer | Atendido
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mensajes (
  id TEXT PRIMARY KEY,
  conversacion_id TEXT NOT NULL REFERENCES conversaciones(id) ON DELETE CASCADE,
  de TEXT NOT NULL,                 -- cliente | agente
  texto TEXT,
  asunto TEXT,                      -- solo para email
  fecha TEXT NOT NULL,
  autor_id TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_estado ON tickets(estado);
CREATE INDEX IF NOT EXISTS idx_tickets_cliente ON tickets(cliente_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa ON oportunidades(etapa);
CREATE INDEX IF NOT EXISTS idx_mensajes_conv ON mensajes(conversacion_id);
`);

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function uid(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(hash, 'hex'));
}

// ------------------------------------------------------------
// SEED â datos de ejemplo (solo si la BD estÃ¡ vacÃ­a)
// ------------------------------------------------------------
function seed() {
  const countUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (countUsers > 0) {
    console.log('La base de datos ya tiene datos. No se vuelve a poblar.');
    return;
  }

  const now = new Date().toISOString();

  // --- Usuarios ---
  const usersSeed = [
    { nombre: 'Admin Tomalo', email: 'admin@tomalo.cl', password: 'admin123', rol: 'admin' },
    { nombre: 'Equipo Comercial', email: 'comercial@tomalo.cl', password: 'comercial123', rol: 'comercial' },
    { nombre: 'Equipo Soporte', email: 'soporte@tomalo.cl', password: 'soporte123', rol: 'agente' }
  ];
  const insertUser = db.prepare('INSERT INTO users (id, nombre, email, password_hash, password_salt, rol, activo, created_at) VALUES (?,?,?,?,?,?,1,?)');
  const userIds = {};
  usersSeed.forEach(u => {
    const { hash, salt } = hashPassword(u.password);
    const id = uid('u');
    userIds[u.email] = id;
    insertUser.run(id, u.nombre, u.email, hash, salt, u.rol, now);
  });

  // --- Canales WhatsApp (placeholders, editar credenciales reales en /canales) ---
  const insertCanalWsp = db.prepare('INSERT INTO canales_whatsapp (id, nombre, telefono, phone_number_id, waba_id, access_token, verify_token, activo, created_at) VALUES (?,?,?,?,?,?,?,1,?)');
  const wspCanal1 = uid('cw');
  const wspCanal2 = uid('cw');
  insertCanalWsp.run(wspCanal1, 'AtenciÃ³n General', '+56 9 0000 0001', '', '', '', uid('vt'), now);
  insertCanalWsp.run(wspCanal2, 'Ventas / Comercial', '+56 9 0000 0002', '', '', '', uid('vt'), now);

  // --- Canales Email ---
  const insertCanalEmail = db.prepare('INSERT INTO canales_email (id, nombre, direccion, proveedor, api_key, dominio, webhook_secret, activo, created_at) VALUES (?,?,?,?,?,?,?,1,?)');
  const emailCanal1 = uid('ce');
  const emailCanal2 = uid('ce');
  insertCanalEmail.run(emailCanal1, 'Soporte', 'soporte@tomalo.cl', 'resend', '', '', uid('whs'), now);
  insertCanalEmail.run(emailCanal2, 'Comercial', 'comercial@tomalo.cl', 'resend', '', '', uid('whs'), now);

  // --- Clientes ---
  const insertCliente = db.prepare('INSERT INTO clientes (id, nombre, contacto, telefono, email, tipo, direccion, etiquetas, notas, fecha_alta, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const clientesSeed = [
    { nombre: 'Distribuidora Norte SpA', contacto: 'Marcela Soto', telefono: '+56 9 8123 4567', email: 'marcela.soto@distnorte.cl', tipo: 'Empresa', direccion: 'Av. Industrial 4520, Antofagasta', etiquetas: ['Cliente frecuente', 'Carga refrigerada'], notas: 'Cliente desde 2024, embarques semanales a la zona norte.' },
    { nombre: 'Comercial Andes Ltda.', contacto: 'Rodrigo Pizarro', telefono: '+56 9 7345 1290', email: 'rpizarro@comercialandes.cl', tipo: 'Empresa', direccion: 'Camino a Melipilla 8900, Santiago', etiquetas: ['Cliente nuevo'], notas: 'Interesado en contrato mensual de distribuciÃ³n metropolitana.' },
    { nombre: 'Importadora PacÃ­fico SA', contacto: 'Daniela Fuentes', telefono: '+56 9 6678 2231', email: 'd.fuentes@impacifico.com', tipo: 'Empresa', direccion: 'Puerto de ValparaÃ­so, Bodega 12', etiquetas: ['Carga contenedores', 'Cliente VIP'], notas: 'Maneja contenedores desde puerto a CD Santiago, alto volumen.' },
    { nombre: 'FrigorÃ­ficos del Sur', contacto: 'Pablo Iturra', telefono: '+56 9 5512 7788', email: 'pablo.iturra@frigosur.cl', tipo: 'Empresa', direccion: 'Ruta 5 Sur Km 1020, Puerto Montt', etiquetas: ['Carga refrigerada', 'Cliente frecuente'], notas: 'Sensible a temperatura de transporte, exige reportes de cadena de frÃ­o.' },
    { nombre: 'Constructora Maipo SpA', contacto: 'Ignacio Vergara', telefono: '+56 9 4456 9012', email: 'ivergara@constructoramaipo.cl', tipo: 'Empresa', direccion: 'Camino LonquÃ¬n 3300, MaipÃº', etiquetas: ['Carga pesada'], notas: 'Traslado de materiales de construcciÃ³n a obras en RM.' },
    { nombre: 'Carlos MÃ©ndez (particular)', contacto: 'Carlos MÃ©ndez', telefono: '+56 9 9988 1122', email: 'carlos.mendez@gmail.com', tipo: 'Particular', direccion: 'Los Aromos 234, Rancagua', etiquetas: [], notas: 'Mudanza residencial, servicio puntual.' }
  ];
  const clienteIds = {};
  clientesSeed.forEach((c, i) => {
    const id = uid('c');
    clienteIds['c' + (i + 1)] = id;
    insertCliente.run(id, c.nombre, c.contacto, c.telefono, c.email, c.tipo, c.direccion, JSON.stringify(c.etiquetas), c.notas, now.slice(0, 10), now);
  });

  // --- Tickets ---
  const insertTicket = db.prepare('INSERT INTO tickets (id, cliente_id, contacto_nombre, telefono, canal_tipo, canal_id, categoria, prioridad, estado, asignado_a, mensaje_original, fecha_creacion, fecha_actualizacion) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const ticketsSeed = [
    { cliente: 'c1', contacto: 'Marcela Soto', telefono: '+56 9 8123 4567', categoria: 'Retraso de envÃ­o', prioridad: 'Alta', estado: 'Nuevo', asignado: 'soporte@tomalo.cl', msg: 'Hola, el camiÃ³n que iba a Antofagasta debÃ­a llegar ayer y aÃºn no llega. Necesitamos saber quÃ© pasÃ³.' },
    { cliente: 'c4', contacto: 'Pablo Iturra', telefono: '+56 9 5512 7788', categoria: 'DaÃ±o de mercancÃ­a', prioridad: 'Urgente', estado: 'En Proceso', asignado: 'soporte@tomalo.cl', msg: 'Recibimos el contenedor con la cÃ¡mara de frÃ­o apagada durante el viaje. Necesitamos respuesta urgente.' },
    { cliente: 'c3', contacto: 'Daniela Fuentes', telefono: '+56 9 6678 2231', categoria: 'Consulta de estado', prioridad: 'Media', estado: 'Resuelto', asignado: 'soporte@tomalo.cl', msg: 'Â¿Me pueden confirmar la hora estimada de llegada del contenedor CONT-88123?' },
    { cliente: 'c2', contacto: 'Rodrigo Pizarro', telefono: '+56 9 7345 1290', categoria: 'Retraso de envÃ­o', prioridad: 'Media', estado: 'En Proceso', asignado: 'soporte@tomalo.cl', msg: 'La entrega programada para hoy en Melipilla aÃºn no sale de bodega, Â¿quÃ© pasÃ³?' },
    { cliente: 'c5', contacto: 'Ignacio Vergara', telefono: '+56 9 4456 9012', categoria: 'Reclamo de servicio', prioridad: 'Media', estado: 'Esperando Cliente', asignado: 'soporte@tomalo.cl', msg: 'El conductor llegÃ³ 2 horas tarde a la obra y no avisÃ³.' },
    { cliente: 'c6', contacto: 'Carlos MÃ¬ndez', telefono: '+56 9 9988 1122', categoria: 'Reclamo de servicio', prioridad: 'Alta', estado: 'Cerrado', asignado: 'soporte@tomalo.cl', msg: 'Uno de los veladores llegÃ³ con una pata rota despuÃ©s de la mudanza.' }
  ];
  ticketsSeed.forEach(t => {
    insertTicket.run(uid('t'), clienteIds[t.cliente], t.contacto, t.telefono, 'whatsapp', wspCanal1, t.categoria, t.prioridad, t.estado, userIds[t.asignado], t.msg, now, now);
  });

  // --- Oportunidades ---
  const insertOp = db.prepare('INSERT INTO oportunidades (id, cliente_id, titulo, valor, etapa, probabilidad, responsable, fecha_creacion, fecha_cierre_estimada, notas) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const opsSeed = [
    { cliente: 'c2', titulo: 'Contrato distribuciÃ³n mensual RM', valor: 4500000, etapa: 'NegociaciÃ³n', prob: 70, notas: 'Cliente nuevo, ajustando tarifa por volumen.' },
    { cliente: 'c3', titulo: 'RenovaciÃ³n contrato anual contenedores', valor: 28000000, etapa: 'Ganado', prob: 100, notas: 'Renovado por 12 meses mÃ¡s.' },
    { cliente: 'c5', titulo: 'Transporte materiales obra MaipÃº Etapa 2', valor: 6800000, etapa: 'Contactado', prob: 40, notas: 'Cliente evaluando 2 proveedores adicionales.' },
    { cliente: 'c1', titulo: 'Ruta adicional Antofagasta-Calama', valor: 5400000, etapa: 'Perdido', prob: 0, notas: 'Cliente optÃ³ por proveedor local.' }
  ];
  opsSeed.forEach(o => {
    insertOp.run(uid('o'), clienteIds[o.cliente], o.titulo, o.valor, o.etapa, o.prob, 'Equipo Comercial', now.slice(0, 10), '', o.notas);
  });

  // --- Conversaciones + mensajes de ejemplo ---
  const insertConv = db.prepare('INSERT INTO conversaciones (id, cliente_id, canal_tipo, canal_id, contacto_nombre, contacto_direccion, estado, updated_at) VALUES (?,?,?,?,?,?,?,?)');
  const insertMsg = db.prepare('INSERT INTO mensajes (id, conversacion_id, de, texto, asunto, fecha, autor_id) VALUES (?,?,?,?,?,?,?)');

  const conv1 = uid('cv');
  insertConv.run(conv1, clienteIds.c1, 'whatsapp', wspCanal1, 'Marcela Soto', '+56 9 8123 4567', 'Sin leer', now);
  insertMsg.run(uid('m'), conv1, 'cliente', 'Hola, el camiÃ³n que iba a Antofagasta debÃ­a llegar ayer y aÃºn no llega.', null, now, null);

  const conv2 = uid('cv');
  insertConv.run(conv2, clienteIds.c4, 'whatsapp', wspCanal1, 'Pablo Iturra', '+56 9 5512 7788', 'Atendido', now);
  insertMsg.run(uid('m'), conv2, 'cliente', 'Recibimos el contenedor con la cÃ¡mara de frÃ­o apagada.', null, now, null);
  insertMsg.run(uid('m'), conv2, 'agente', 'Hola Pablo, lo lamentamos. Estamos revisando la bitÃ¡cora y te confirmamos hoy mismo.', null, now, userIds['soporte@tomalo.cl']);

  const conv3 = uid('cv');
  insertConv.run(conv3, clienteIds.c2, 'email', emailCanal2, 'Rodrigo Pizarro', 'rpizarro@comercialandes.cl', 'Sin leer', now);
  insertMsg.run(uid('m'), conv3, 'cliente', 'Buenas tardes, quisiÃ©ramos avanzar con la propuesta de contrato mensual. Â¿Podemos agendar una llamada esta semana?', 'Propuesta contrato mensual', now, null);

  console.log('Base de datos poblada con datos de ejemplo.');
  console.log('Usuarios de prueba:');
  usersSeed.forEach(u => console.log(`  - ${u.email} / ${u.password} (${u.rol})`));
}

if (require.main === module && process.argv.includes('--seed')) {
  seed();
}

module.exports = { db, uid, hashPassword, verifyPassword, seed };
