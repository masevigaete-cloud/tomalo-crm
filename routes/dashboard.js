// ============================================================
// routes/dashboard.js
// ============================================================
const { db } = require('../db');
const { sendJson } = require('../lib/router');

const ESTADOS_TICKET = ['Nuevo', 'En Proceso', 'Esperando Cliente', 'Resuelto', 'Cerrado'];
const PRIORIDADES = ['Urgente', 'Alta', 'Media', 'Baja'];
const ETAPAS_CRM = ['Prospecto', 'Contactado', 'CotizaciÃ³n Enviada', 'NegociaciÃ³n', 'Ganado', 'Perdido'];

function register(router, { requireAuth }) {
  router.get('/api/dashboard', requireAuth, async (req, res) => {
    const tickets = db.prepare('SELECT * FROM tickets').all();
    const oportunidades = db.prepare('SELECT * FROM oportunidades').all();

    const abiertos = tickets.filter(t => !['Resuelto', 'Cerrado'].includes(t.estado)).length;
    const urgentes = tickets.filter(t => t.prioridad === 'Urgente' && !['Resuelto', 'Cerrado'].includes(t.estado)).length;
    const resueltos = tickets.filter(t => ['Resuelto', 'Cerrado'].includes(t.estado)).length;
    const tasaResolucion = tickets.length ? Math.round((resueltos / tickets.length) * 100) : 0;

    const pipelineActivo = oportunidades.filter(o => !['Ganado', 'Perdido'].includes(o.etapa));
    const valorPipeline = pipelineActivo.reduce((s, o) => s + Number(o.valor || 0), 0);
    const valorGanado = oportunidades.filter(o => o.etapa === 'Ganado').reduce((s, o) => s + Number(o.valor || 0), 0);

    const porEstado = ESTADOS_TICKET.map(e => ({ label: e, value: tickets.filter(t => t.estado === e).length }));
    const porPrioridad = PRIORIDADES.map(p => ({ label: p, value: tickets.filter(t => t.prioridad === p).length }));
    const porEtapa = ETAPAS_CRM.map(e => ({ label: e, value: oportunidades.filter(o => o.etapa === e).length }));

    const recientes = db.prepare('SELECT t.*, c.nombre AS cliente_nombre FROM tickets t LEFT JOIN clientes c ON c.id = t.cliente_id ORDER BY t.fecha_creacion DESC LIMIT 6').all();

    sendJson(res, 200, {
      kpis: {
        abiertos, urgentes, tasaResolucion,
        oportunidadesActivas: pipelineActivo.length,
        valorPipeline, valorGanado
      },
      porEstado, porPrioridad, porEtapa, recientes
    });
  });
}

module.exports = { register };
