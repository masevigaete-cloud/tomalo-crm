// ============================================================
// Tomalo CRM â Frontend SPA (vanilla JS, sin frameworks)
// Consume la API REST del backend (/api/*) con autenticaciÃ³n
// por sesiÃ³n (Bearer token guardado en localStorage).
// ============================================================

const ESTADOS_TICKET = ['Nuevo', 'En Proceso', 'Esperando Cliente', 'Resuelto', 'Cerrado'];
const PRIORIDADES = ['Urgente', 'Alta', 'Media', 'Baja'];
const ETAPAS_CRM = ['Prospecto', 'Contactado', 'CotizaciÃ³n Enviada', 'NegociaciÃ³n', 'Ganado', 'Perdido'];
const CATEGORIAS_TICKET = ['Retraso de envÃ­o', 'DaÃ±o de mercancÃ­a', 'Consulta de estado', 'Reclamo de servicio', 'InformaciÃ³n de cotizaciÃ³n', 'Otro'];
const TIPOS_CLIENTE = ['Empresa', 'Particular'];

const state = {
  token: localStorage.getItem('tomalo_token') || null,
  user: null,
  usuariosCache: null,
  clientesCache: null,
  canalesWsp: null,
  canalesEmail: null,
  activeConv: { whatsapp: null, email: null }
};

try {
  const storedUser = localStorage.getItem('tomalo_user');
  if (storedUser) state.user = JSON.parse(storedUser);
} catch (e) { /* ignore */ }

// ============================================================
// UTILIDADES
// ============================================================
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(value) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n);
}

function formatDateTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) { return iso; }
}

function priorityTagClass(p) {
  switch (p) {
    case 'Urgente': return 'tag tag-urgente';
    case 'Alta': return 'tag tag-alta';
    case 'Media': return 'tag tag-media';
    default: return 'tag tag-baja';
  }
}

let toastTimer = null;
function showToast(msg, type) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal').innerHTML = '';
}

$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ============================================================
// CLIENTE API
// ============================================================
async function api(method, path, body) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let resp;
  try {
    resp = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error('No se pudo conectar con el servidor.');
  }

  if (resp.status === 401) {
    handleSessionExpired();
    throw new Error('SesiÃ³n expirada. Inicia sesiÃ³n nuevamente.');
  }

  let data = null;
  const text = await resp.text();
  if (text) {
    try { data = JSON.parse(text); } catch (e) { data = null; }
  }

  if (!resp.ok) {
    throw new Error((data && data.error) || ('Error ' + resp.status));
  }
  return data;
}

function handleSessionExpired() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('tomalo_token');
  localStorage.removeItem('tomalo_user');
  showLogin();
}

// ============================================================
// AUTENTICACIÃN
// ============================================================
function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  applyRoleVisibility();
  renderUserChip();
}

function applyRoleVisibility() {
  const isAdmin = state.user && state.user.rol === 'admin';
  $('#nav-canales').style.display = isAdmin ? '' : 'none';
  $('#nav-usuarios').style.display = isAdmin ? '' : 'none';
}

function renderUserChip() {
  if (!state.user) return;
  const initials = state.user.nombre.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  $('#user-avatar').textContent = initials;
  $('#user-name').textContent = state.user.nombre;
  $('#user-role').textContent = state.user.rol;
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const password = $('#login-password').value;
  const errorBox = $('#login-error');
  errorBox.classList.add('hidden');
  try {
    const result = await api('POST', '/api/auth/login', { email, password });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('tomalo_token', state.token);
    localStorage.setItem('tomalo_user', JSON.stringify(state.user));
    showApp();
    switchView('dashboard');
  } catch (err) {
    errorBox.textContent = err.message || 'No se pudo iniciar sesiÃ³n.';
    errorBox.classList.remove('hidden');
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('POST', '/api/auth/logout'); } catch (e) { /* ignore */ }
  state.token = null;
  state.user = null;
  state.usuariosCache = null;
  state.clientesCache = null;
  state.canalesWsp = null;
  state.canalesEmail = null;
  localStorage.removeItem('tomalo_token');
  localStorage.removeItem('tomalo_user');
  showLogin();
});

// ============================================================
// NAVEGACIÃN
// ============================================================
const viewRenderers = {
  dashboard: renderDashboard,
  whatsapp: () => renderInbox('whatsapp'),
  email: () => renderInbox('email'),
  tickets: renderTickets,
  crm: renderCrm,
  clientes: renderClientes,
  canales: renderCanales,
  usuarios: renderUsuarios,
  ayuda: () => {}
};

function switchView(viewName) {
  $all('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  $all('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + viewName));
  const renderer = viewRenderers[viewName];
  if (renderer) {
    Promise.resolve(renderer()).catch(err => showToast(err.message || 'Error al cargar', 'error'));
  }
}

$all('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ============================================================
// DATOS COMPARTIDOS (cache simple)
// ============================================================
async function getClientes(force) {
  if (!state.clientesCache || force) {
    state.clientesCache = await api('GET', '/api/clientes');
  }
  return state.clientesCache;
}

async function getUsuarios(force) {
  if (state.user.rol !== 'admin') return [];
  if (!state.usuariosCache || force) {
    state.usuariosCache = await api('GET', '/api/usuarios');
  }
  return state.usuariosCache;
}

async function getCanalesWsp(force) {
  if (!state.canalesWsp || force) {
    state.canalesWsp = await api('GET', '/api/canales/whatsapp');
  }
  return state.canalesWsp;
}

async function getCanalesEmail(force) {
  if (!state.canalesEmail || force) {
    state.canalesEmail = await api('GET', '/api/canales/email');
  }
  return state.canalesEmail;
}

async function updateInboxBadges() {
  try {
    const convs = await api('GET', '/api/conversaciones');
    const wspUnread = convs.filter(c => c.canal_tipo === 'whatsapp' && c.estado === 'Sin leer').length;
    const emailUnread = convs.filter(c => c.canal_tipo === 'email' && c.estado === 'Sin leer').length;
    const wspBadge = $('#nav-wsp-badge');
    const emailBadge = $('#nav-email-badge');
    wspBadge.textContent = wspUnread || '';
    wspBadge.style.display = wspUnread ? '' : 'none';
    emailBadge.textContent = emailUnread || '';
    emailBadge.style.display = emailUnread ? '' : 'none';
  } catch (e) { /* ignore */ }
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard() {
  const data = await api('GET', '/api/dashboard');

  $('#kpi-grid').innerHTML = `
    <div class="kpi-card accent">
      <div class="kpi-value">${data.kpis.abiertos}</div>
      <div class="kpi-label">Tickets abiertos</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${data.kpis.urgentes}</div>
      <div class="kpi-label">Tickets urgentes</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${data.kpis.tasaResolucion}%</div>
      <div class="kpi-label">Tasa de resoluciÃ³n</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${data.kpis.oportunidadesActivas}</div>
      <div class="kpi-label">Oportunidades activas</div>
    </div>
    <div class="kpi-card accent">
      <div class="kpi-value">${formatMoney(data.kpis.valorPipeline)}</div>
      <div class="kpi-label">Valor en pipeline</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-value">${formatMoney(data.kpis.valorGanado)}</div>
      <div class="kpi-label">Valor ganado</div>
    </div>
  `;

  $('#chart-tickets-estado').innerHTML = renderBarChart(data.porEstado);
  $('#chart-tickets-prioridad').innerHTML = renderBarChart(data.porPrioridad);
  $('#chart-pipeline-etapa').innerHTML = renderBarChart(data.porEtapa);

  $('#dashboard-recent-tickets').innerHTML = data.recientes.length
    ? data.recientes.map(t => `
        <div class="mini-item">
          <div>
            <div class="mini-title">${escapeHtml(t.cliente_nombre || t.contacto_nombre || 'Sin cliente')}</div>
            <div class="mini-sub">${escapeHtml(t.categoria || '')} Â· ${formatDate(t.fecha_creacion)}</div>
          </div>
          <span class="${priorityTagClass(t.prioridad)}">${escapeHtml(t.estado)}</span>
        </div>
      `).join('')
    : '<div class="empty-state">No hay tickets todavÃ­a.</div>';

  updateInboxBadges();
}

function renderBarChart(items) {
  const max = Math.max(1, ...items.map(i => i.value));
  return items.map(i => `
    <div class="bar-row">
      <div class="bar-label">${escapeHtml(i.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(i.value / max) * 100}%"></div></div>
      <div class="bar-value">${i.value}</div>
    </div>
  `).join('');
}

// ============================================================
// BANDEJAS (WhatsApp / Email)
// ============================================================
async function renderInbox(tipo) {
  const [conversaciones, canales, clientes] = await Promise.all([
    api('GET', '/api/conversaciones'),
    tipo === 'whatsapp' ? getCanalesWsp() : getCanalesEmail(),
    getClientes()
  ]);

  const canalMap = {};
  canales.forEach(c => { canalMap[c.id] = c; });

  const filtered = conversaciones
    .filter(c => c.canal_tipo === tipo)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  const listEl = $('#wsp-list-' + tipo);
  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-state">Sin conversaciones todavÃ­a.</div>';
  } else {
    listEl.innerHTML = filtered.map(c => {
      const canal = canalMap[c.canal_id];
      const active = state.activeConv[tipo] === c.id;
      return `
        <div class="wsp-list-item ${active ? 'active' : ''}" data-id="${c.id}">
          <div class="wli-top">
            <span class="wli-name">${escapeHtml(c.contacto_nombre || c.contacto_direccion)}</span>
            <span class="wli-time">${formatDateTime(c.ultima_fecha || c.updated_at)}</span>
          </div>
          <div class="wli-preview">${escapeHtml(c.ultimo_mensaje || '')}</div>
          <div class="wli-meta">
            <span class="tag tag-info">${escapeHtml(canal ? canal.nombre : 'Canal eliminado')}</span>
            ${c.estado === 'Sin leer' ? '<span class="tag tag-urgente">Sin leer</span>' : '<span class="tag tag-baja">Atendido</span>'}
          </div>
        </div>
      `;
    }).join('');

    $all('.wsp-list-item', listEl).forEach(item => {
      item.addEventListener('click', () => {
        state.activeConv[tipo] = item.dataset.id;
        renderInbox(tipo);
      });
    });
  }

  const activeId = state.activeConv[tipo];
  const threadEl = $('#wsp-thread-' + tipo);
  if (!activeId || !filtered.find(c => c.id === activeId)) {
    threadEl.innerHTML = '<div class="empty-state">Selecciona una conversaciÃ³n para verla aquÃ­.</div>';
    return;
  }

  const conv = await api('GET', '/api/conversaciones/' + activeId);
  const canal = canalMap[conv.canal_id];
  const cliente = clientes.find(c => c.id === conv.cliente_id);

  threadEl.innerHTML = `
    <div class="wsp-thread-header">
      <div>
        <h3>${escapeHtml(conv.contacto_nombre || conv.contacto_direccion)}</h3>
        <div class="wth-sub">${escapeHtml(conv.contacto_direccion)} Â· ${escapeHtml(canal ? canal.nombre : 'Canal eliminado')}${cliente ? ' Â· Cliente: ' + escapeHtml(cliente.nombre) : ' Â· Sin cliente vinculado'}</div>
      </div>
      <div class="wth-actions">
        <button class="btn btn-sm" id="inbox-crear-ticket">+ Ticket</button>
        <button class="btn btn-sm" id="inbox-crear-oportunidad">+ Oportunidad</button>
        <button class="btn btn-sm" id="inbox-marcar-atendido">Marcar atendido</button>
      </div>
    </div>
    <div class="wsp-messages" id="wsp-messages-${tipo}">
      ${conv.mensajes.map(m => `
        <div class="msg-bubble ${m.de === 'agente' ? 'agente' : 'cliente'}">
          ${m.asunto ? `<div style="font-weight:700; margin-bottom:4px;">${escapeHtml(m.asunto)}</div>` : ''}
          <div>${escapeHtml(m.texto)}</div>
          <div class="msg-meta">${formatDateTime(m.fecha)}</div>
        </div>
      `).join('')}
    </div>
    <form class="wsp-reply" id="wsp-reply-form">
      ${tipo === 'email' ? `<input type="text" id="wsp-reply-asunto" placeholder="Asunto" style="max-width:200px;">` : ''}
      <textarea id="wsp-reply-text" placeholder="Escribe una respuesta..." required></textarea>
      <button type="submit" class="btn btn-primary">Enviar</button>
    </form>
  `;

  const messagesBox = $('#wsp-messages-' + tipo);
  messagesBox.scrollTop = messagesBox.scrollHeight;

  $('#wsp-reply-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const texto = $('#wsp-reply-text').value.trim();
    if (!texto) return;
    const asunto = tipo === 'email' ? $('#wsp-reply-asunto').value.trim() : undefined;
    try {
      const result = await api('POST', `/api/conversaciones/${conv.id}/mensajes`, { texto, asunto });
      if (result.envio && !result.envio.enviado) {
        showToast('Mensaje guardado, pero no se pudo enviar: ' + result.envio.detalle, 'error');
      } else {
        showToast('Mensaje enviado.', 'success');
      }
      renderInbox(tipo);
      updateInboxBadges();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  $('#inbox-marcar-atendido').addEventListener('click', async () => {
    try {
      await api('PUT', '/api/conversaciones/' + conv.id, { estado: 'Atendido' });
      showToast('ConversaciÃ³n marcada como atendida.', 'success');
      renderInbox(tipo);
      updateInboxBadges();
    } catch (err) { showToast(err.message, 'error'); }
  });

  $('#inbox-crear-ticket').addEventListener('click', () => {
    const ultimoCliente = [...conv.mensajes].reverse().find(m => m.de === 'cliente');
    openTicketModal(null, {
      clienteId: conv.cliente_id,
      contactoNombre: conv.contacto_nombre,
      telefono: tipo === 'whatsapp' ? conv.contacto_direccion : '',
      canalTipo: tipo,
      canalId: conv.canal_id,
      mensajeOriginal: ultimoCliente ? ultimoCliente.texto : ''
    });
  });

  $('#inbox-crear-oportunidad').addEventListener('click', () => {
    openOportunidadModal(null, {
      clienteId: conv.cliente_id,
      titulo: 'Oportunidad â ' + (conv.contacto_nombre || conv.contacto_direccion)
    });
  });

  updateInboxBadges();
}

// ============================================================
// TICKETS (KANBAN)
// ============================================================
let ticketsCache = [];

async function renderTickets() {
  const [tickets, clientes] = await Promise.all([api('GET', '/api/tickets'), getClientes()]);
  ticketsCache = tickets;

  // Filtros
  const prioridadSel = $('#filter-prioridad');
  if (!prioridadSel.dataset.filled) {
    prioridadSel.innerHTML = '<option value="">Todas las prioridades</option>' + PRIORIDADES.map(p => `<option value="${p}">${p}</option>`).join('');
    prioridadSel.dataset.filled = '1';
    prioridadSel.addEventListener('change', () => renderTicketsKanban(clientes));
  }
  const categoriaSel = $('#filter-categoria');
  if (!categoriaSel.dataset.filled) {
    categoriaSel.innerHTML = '<option value="">Todas las categorÃ­as</option>' + CATEGORIAS_TICKET.map(c => `<option value="${c}">${c}</option>`).join('');
    categoriaSel.dataset.filled = '1';
    categoriaSel.addEventListener('change', () => renderTicketsKanban(clientes));
  }
  const searchInput = $('#ticket-search');
  if (!searchInput.dataset.filled) {
    searchInput.dataset.filled = '1';
    searchInput.addEventListener('input', () => renderTicketsKanban(clientes));
  }
  const btnNew = $('#btn-new-ticket');
  if (!btnNew.dataset.filled) {
    btnNew.dataset.filled = '1';
    btnNew.addEventListener('click', () => openTicketModal(null, {}));
  }

  renderTicketsKanban(clientes);
}

function renderTicketsKanban(clientes) {
  const search = $('#ticket-search').value.trim().toLowerCase();
  const prioridad = $('#filter-prioridad').value;
  const categoria = $('#filter-categoria').value;

  const clienteMap = {};
  clientes.forEach(c => { clienteMap[c.id] = c; });

  const filtered = ticketsCache.filter(t => {
    if (prioridad && t.prioridad !== prioridad) return false;
    if (categoria && t.categoria !== categoria) return false;
    if (search) {
      const cliente = clienteMap[t.cliente_id];
      const haystack = [
        t.contacto_nombre, t.telefono, t.categoria, t.mensaje_original,
        cliente ? cliente.nombre : ''
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const kanban = $('#tickets-kanban');
  kanban.innerHTML = ESTADOS_TICKET.map(estado => {
    const items = filtered.filter(t => t.estado === estado);
    return `
      <div class="kanban-col" data-estado="${escapeHtml(estado)}">
        <div class="kanban-col-header">
          <span>${escapeHtml(estado)}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="kanban-col-body" data-estado="${escapeHtml(estado)}">
          ${items.map(t => {
            const cliente = clienteMap[t.cliente_id];
            return `
              <div class="kanban-card" draggable="true" data-id="${t.id}">
                <div class="kc-title">${escapeHtml(cliente ? cliente.nombre : (t.contacto_nombre || 'Sin cliente'))}</div>
                <div class="kc-sub">${escapeHtml(t.categoria || 'Sin categorÃ­a')}</div>
                <div class="kc-tags">
                  <span class="${priorityTagClass(t.prioridad)}">${escapeHtml(t.prioridad)}</span>
                  <span class="tag tag-info">${escapeHtml(t.canal_tipo)}</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  setupKanbanDragDrop(kanban, async (ticketId, nuevoEstado) => {
    try {
      await api('PUT', '/api/tickets/' + ticketId, { estado: nuevoEstado });
      showToast('Ticket actualizado.', 'success');
      const t = ticketsCache.find(x => x.id === ticketId);
      if (t) t.estado = nuevoEstado;
      renderTicketsKanban(clientes);
    } catch (err) { showToast(err.message, 'error'); }
  });

  $all('.kanban-card', kanban).forEach(card => {
    card.addEventListener('click', () => {
      const ticket = ticketsCache.find(t => t.id === card.dataset.id);
      if (ticket) openTicketModal(ticket, {});
    });
  });
}

function setupKanbanDragDrop(kanban, onDrop) {
  let draggedId = null;
  $all('.kanban-card', kanban).forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedId = card.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
    });
  });
  $all('.kanban-col-body', kanban).forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.style.background = 'var(--naranjo-light)';
    });
    col.addEventListener('dragleave', () => { col.style.background = ''; });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.style.background = '';
      if (draggedId) onDrop(draggedId, col.dataset.estado);
    });
  });
}

async function openTicketModal(ticket, prefill) {
  const clientes = await getClientes();
  const usuarios = await getUsuarios();
  const isNew = !ticket;
  const data = ticket || {
    cliente_id: prefill.clienteId || '',
    contacto_nombre: prefill.contactoNombre || '',
    telefono: prefill.telefono || '',
    canal_tipo: prefill.canalTipo || 'manual',
    canal_id: prefill.canalId || null,
    categoria: 'Otro',
    prioridad: 'Media',
    estado: 'Nuevo',
    asignado_a: '',
    mensaje_original: prefill.mensajeOriginal || '',
    notas: []
  };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nuevo ticket' : 'Ticket'}</h2>
    <div class="field">
      <label>Cliente</label>
      <select id="t-cliente">
        <option value="">â Sin cliente vinculado â</option>
        ${clientes.map(c => `<option value="${c.id}" ${c.id === data.cliente_id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Nombre de contacto</label>
        <input type="text" id="t-contacto" value="${escapeHtml(data.contacto_nombre || '')}">
      </div>
      <div class="field">
        <label>TelÃ©fono</label>
        <input type="text" id="t-telefono" value="${escapeHtml(data.telefono || '')}">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>CategorÃ­a</label>
        <select id="t-categoria">
          ${CATEGORIAS_TICKET.map(c => `<option value="${c}" ${c === data.categoria ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Prioridad</label>
        <select id="t-prioridad">
          ${PRIORIDADES.map(p => `<option value="${p}" ${p === data.prioridad ? 'selected' : ''}>${p}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Estado</label>
        <select id="t-estado" ${isNew ? 'disabled' : ''}>
          ${ESTADOS_TICKET.map(e => `<option value="${e}" ${e === data.estado ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
      </div>
      ${usuarios.length ? `
      <div class="field">
        <label>Asignado a</label>
        <select id="t-asignado">
          <option value="">â Sin asignar â</option>
          ${usuarios.map(u => `<option value="${u.id}" ${u.id === data.asignado_a ? 'selected' : ''}>${escapeHtml(u.nombre)}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <div class="field">
      <label>Mensaje original / descripciÃ³n</label>
      <textarea id="t-mensaje" rows="3" ${isNew ? '' : 'readonly'}>${escapeHtml(data.mensaje_original || '')}</textarea>
    </div>
    ${!isNew ? `
      <div class="field">
        <label>Notas internas</label>
        <div class="notas-list">
          ${(data.notas || []).map(n => `
            <div class="nota-item">
              <div class="nota-meta">${escapeHtml(n.autor || '')} Â· ${formatDateTime(n.fecha)}</div>
              <div>${escapeHtml(n.texto)}</div>
            </div>
          `).join('') || '<div class="muted">Sin notas todavÃ­a.</div>'}
        </div>
        <textarea id="t-nueva-nota" rows="2" placeholder="Agregar una nota interna..."></textarea>
      </div>
    ` : ''}
    <div class="modal-actions">
      ${!isNew ? '<button class="btn btn-danger" id="t-delete">Eliminar</button>' : ''}
      <button class="btn" id="t-cancel">Cancelar</button>
      <button class="btn btn-primary" id="t-save">${isNew ? 'Crear ticket' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#t-cancel').addEventListener('click', closeModal);

  if (!isNew) {
    $('#t-delete').addEventListener('click', async () => {
      if (!confirm('Â¿Eliminar este ticket? Esta acciÃ³n no se puede deshacer.')) return;
      try {
        await api('DELETE', '/api/tickets/' + ticket.id);
        showToast('Ticket eliminado.', 'success');
        closeModal();
        renderTickets();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  $('#t-save').addEventListener('click', async () => {
    const payload = {
      clienteId: $('#t-cliente').value || null,
      contactoNombre: $('#t-contacto').value.trim(),
      telefono: $('#t-telefono').value.trim(),
      categoria: $('#t-categoria').value,
      prioridad: $('#t-prioridad').value,
    };
    const asignadoSel = $('#t-asignado');
    if (asignadoSel) payload.asignadoA = asignadoSel.value || null;

    try {
      if (isNew) {
        payload.canalTipo = data.canal_tipo;
        payload.canalId = data.canal_id;
        payload.mensajeOriginal = $('#t-mensaje').value.trim();
        await api('POST', '/api/tickets', payload);
        showToast('Ticket creado.', 'success');
      } else {
        payload.estado = $('#t-estado').value;
        const nota = $('#t-nueva-nota').value.trim();
        if (nota) payload.nuevaNota = nota;
        await api('PUT', '/api/tickets/' + ticket.id, payload);
        showToast('Ticket actualizado.', 'success');
      }
      closeModal();
      renderTickets();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// CRM (PIPELINE KANBAN)
// ============================================================
let oportunidadesCache = [];

async function renderCrm() {
  const [oportunidades, clientes] = await Promise.all([api('GET', '/api/oportunidades'), getClientes()]);
  oportunidadesCache = oportunidades;

  const btnNew = $('#btn-new-oportunidad');
  if (!btnNew.dataset.filled) {
    btnNew.dataset.filled = '1';
    btnNew.addEventListener('click', () => openOportunidadModal(null, {}));
  }

  const clienteMap = {};
  clientes.forEach(c => { clienteMap[c.id] = c; });

  const totalActivo = oportunidades
    .filter(o => !['Ganado', 'Perdido'].includes(o.etapa))
    .reduce((s, o) => s + Number(o.valor || 0), 0);
  const totalGanado = oportunidades.filter(o => o.etapa === 'Ganado').reduce((s, o) => s + Number(o.valor || 0), 0);
  $('#pipeline-total').innerHTML = `<span class="tag tag-naranjo">Pipeline activo: ${formatMoney(totalActivo)}</span> <span class="tag tag-baja">Ganado: ${formatMoney(totalGanado)}</span>`;

  const kanban = $('#crm-kanban');
  kanban.innerHTML = ETAPAS_CRM.map(etapa => {
    const items = oportunidades.filter(o => o.etapa === etapa);
    return `
      <div class="kanban-col" data-etapa="${escapeHtml(etapa)}">
        <div class="kanban-col-header">
          <span>${escapeHtml(etapa)}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="kanban-col-body" data-etapa="${escapeHtml(etapa)}">
          ${items.map(o => {
            const cliente = clienteMap[o.cliente_id];
            return `
              <div class="kanban-card" draggable="true" data-id="${o.id}">
                <div class="kc-title">${escapeHtml(o.titulo)}</div>
                <div class="kc-sub">${escapeHtml(cliente ? cliente.nombre : 'Sin cliente')}</div>
                <div class="kc-tags">
                  <span class="tag tag-naranjo">${formatMoney(o.valor)}</span>
                  <span class="tag tag-info">${o.probabilidad}%</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  setupKanbanDragDrop(kanban, async (opId, nuevaEtapa) => {
    try {
      await api('PUT', '/api/oportunidades/' + opId, { etapa: nuevaEtapa });
      showToast('Oportunidad actualizada.', 'success');
      renderCrm();
    } catch (err) { showToast(err.message, 'error'); }
  });

  $all('.kanban-card', kanban).forEach(card => {
    card.addEventListener('click', () => {
      const op = oportunidadesCache.find(o => o.id === card.dataset.id);
      if (op) openOportunidadModal(op, {});
    });
  });
}

async function openOportunidadModal(op, prefill) {
  const clientes = await getClientes();
  const isNew = !op;
  const data = op || {
    cliente_id: prefill.clienteId || '',
    titulo: prefill.titulo || '',
    valor: 0,
    etapa: 'Prospecto',
    probabilidad: 20,
    fecha_cierre_estimada: '',
    notas: ''
  };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nueva oportunidad' : 'Oportunidad'}</h2>
    <div class="field">
      <label>TÃ­tulo</label>
      <input type="text" id="o-titulo" value="${escapeHtml(data.titulo)}">
    </div>
    <div class="field">
      <label>Cliente</label>
      <select id="o-cliente">
        <option value="">â Sin cliente vinculado â</option>
        ${clientes.map(c => `<option value="${c.id}" ${c.id === data.cliente_id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
      </select>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Valor estimado (CLP)</label>
        <input type="number" id="o-valor" min="0" step="1000" value="${Number(data.valor || 0)}">
      </div>
      <div class="field">
        <label>Probabilidad (%)</label>
        <input type="number" id="o-probabilidad" min="0" max="100" value="${Number(data.probabilidad || 0)}">
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Etapa</label>
        <select id="o-etapa">
          ${ETAPAS_CRM.map(e => `<option value="${e}" ${e === data.etapa ? 'selected' : ''}>${e}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Cierre estimado</label>
        <input type="date" id="o-fecha" value="${escapeHtml(data.fecha_cierre_estimada || '')}">
      </div>
    </div>
    <div class="field">
      <label>Notas</label>
      <textarea id="o-notas" rows="3">${escapeHtml(data.notas || '')}</textarea>
    </div>
    <div class="modal-actions">
      ${!isNew ? '<button class="btn btn-danger" id="o-delete">Eliminar</button>' : ''}
      <button class="btn" id="o-cancel">Cancelar</button>
      <button class="btn btn-primary" id="o-save">${isNew ? 'Crear oportunidad' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#o-cancel').addEventListener('click', closeModal);

  if (!isNew) {
    $('#o-delete').addEventListener('click', async () => {
      if (!confirm('Â¿Eliminar esta oportunidad?')) return;
      try {
        await api('DELETE', '/api/oportunidades/' + op.id);
        showToast('Oportunidad eliminada.', 'success');
        closeModal();
        renderCrm();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  $('#o-save').addEventListener('click', async () => {
    const payload = {
      titulo: $('#o-titulo').value.trim(),
      clienteId: $('#o-cliente').value || null,
      valor: Number($('#o-valor').value || 0),
      probabilidad: Number($('#o-probabilidad').value || 0),
      etapa: $('#o-etapa').value,
      fechaCierreEstimada: $('#o-fecha').value,
      notas: $('#o-notas').value.trim()
    };
    if (!payload.titulo) { showToast('El tÃ­tulo es obligatorio.', 'error'); return; }
    try {
      if (isNew) {
        await api('POST', '/api/oportunidades', payload);
        showToast('Oportunidad creada.', 'success');
      } else {
        await api('PUT', '/api/oportunidades/' + op.id, payload);
        showToast('Oportunidad actualizada.', 'success');
      }
      closeModal();
      renderCrm();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// CLIENTES
// ============================================================
let clientesTableCache = [];

async function renderClientes() {
  const clientes = await getClientes(true);
  clientesTableCache = clientes;

  const searchInput = $('#cliente-search');
  if (!searchInput.dataset.filled) {
    searchInput.dataset.filled = '1';
    searchInput.addEventListener('input', renderClientesTable);
  }
  const btnNew = $('#btn-new-cliente');
  if (!btnNew.dataset.filled) {
    btnNew.dataset.filled = '1';
    btnNew.addEventListener('click', () => openClienteModal(null));
  }

  renderClientesTable();
}

function renderClientesTable() {
  const search = $('#cliente-search').value.trim().toLowerCase();
  const filtered = clientesTableCache.filter(c => {
    if (!search) return true;
    return [c.nombre, c.contacto, c.telefono, c.email].join(' ').toLowerCase().includes(search);
  });

  const tbody = $('#clientes-table tbody');
  tbody.innerHTML = filtered.map(c => `
    <tr data-id="${c.id}">
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td>${escapeHtml(c.contacto || 'â')}</td>
      <td>${escapeHtml(c.telefono || 'â')}</td>
      <td>${escapeHtml(c.tipo || 'â')}</td>
      <td>${(c.etiquetas || []).map(t => `<span class="tag tag-naranjo">${escapeHtml(t)}</span>`).join(' ') || 'â'}</td>
      <td>${c.numTickets}</td>
      <td>${c.numOps}</td>
      <td><button class="btn btn-sm cliente-edit">Editar</button> <button class="btn btn-sm btn-danger cliente-delete">Eliminar</button></td>
    </tr>
  `).join('') || `<tr><td colspan="8" class="muted" style="text-align:center; padding:24px;">Sin clientes.</td></tr>`;

  $all('.cliente-edit', tbody).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('tr').dataset.id;
      const cliente = clientesTableCache.find(c => c.id === id);
      openClienteModal(cliente);
    });
  });
  $all('.cliente-delete', tbody).forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('tr').dataset.id;
      if (!confirm('Â¿Eliminar este cliente? Se desvincularÃ¡ de sus tickets y oportunidades.')) return;
      try {
        await api('DELETE', '/api/clientes/' + id);
        showToast('Cliente eliminado.', 'success');
        renderClientes();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });
}

function openClienteModal(cliente) {
  const isNew = !cliente;
  const data = cliente || { nombre: '', contacto: '', telefono: '', email: '', tipo: 'Empresa', direccion: '', etiquetas: [], notas: '' };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nuevo cliente' : 'Editar cliente'}</h2>
    <div class="field">
      <label>Nombre / Empresa</label>
      <input type="text" id="c-nombre" value="${escapeHtml(data.nombre)}">
    </div>
    <div class="field-row">
      <div class="field">
        <label>Contacto</label>
        <input type="text" id="c-contacto" value="${escapeHtml(data.contacto || '')}">
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="c-tipo">
          ${TIPOS_CLIENTE.map(t => `<option value="${t}" ${t === data.tipo ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>TelÃ©fono</label>
        <input type="text" id="c-telefono" value="${escapeHtml(data.telefono || '')}">
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" id="c-email" value="${escapeHtml(data.email || '')}">
      </div>
    </div>
    <div class="field">
      <label>DirecciÃ³n</label>
      <input type="text" id="c-direccion" value="${escapeHtml(data.direccion || '')}">
    </div>
    <div class="field">
      <label>Etiquetas (separadas por coma)</label>
      <input type="text" id="c-etiquetas" value="${escapeHtml((data.etiquetas || []).join(', '))}">
    </div>
    <div class="field">
      <label>Notas</label>
      <textarea id="c-notas" rows="3">${escapeHtml(data.notas || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn" id="c-cancel">Cancelar</button>
      <button class="btn btn-primary" id="c-save">${isNew ? 'Crear cliente' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#c-cancel').addEventListener('click', closeModal);

  $('#c-save').addEventListener('click', async () => {
    const payload = {
      nombre: $('#c-nombre').value.trim(),
      contacto: $('#c-contacto').value.trim(),
      tipo: $('#c-tipo').value,
      telefono: $('#c-telefono').value.trim(),
      email: $('#c-email').value.trim(),
      direccion: $('#c-direccion').value.trim(),
      etiquetas: $('#c-etiquetas').value.split(',').map(s => s.trim()).filter(Boolean),
      notas: $('#c-notas').value.trim()
    };
    if (!payload.nombre) { showToast('El nombre es obligatorio.', 'error'); return; }
    try {
      if (isNew) {
        await api('POST', '/api/clientes', payload);
        showToast('Cliente creado.', 'success');
      } else {
        await api('PUT', '/api/clientes/' + cliente.id, payload);
        showToast('Cliente actualizado.', 'success');
      }
      closeModal();
      renderClientes();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// CANALES (ADMIN)
// ============================================================
async function renderCanales() {
  const [wsp, email] = await Promise.all([getCanalesWsp(true), getCanalesEmail(true)]);

  const btnWsp = $('#btn-new-canal-wsp');
  if (!btnWsp.dataset.filled) {
    btnWsp.dataset.filled = '1';
    btnWsp.addEventListener('click', () => openCanalWspModal(null));
  }
  const btnEmail = $('#btn-new-canal-email');
  if (!btnEmail.dataset.filled) {
    btnEmail.dataset.filled = '1';
    btnEmail.addEventListener('click', () => openCanalEmailModal(null));
  }

  const origin = window.location.origin;

  const wspBody = $('#canales-wsp-table tbody');
  wspBody.innerHTML = wsp.map(c => `
    <tr data-id="${c.id}">
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td>${escapeHtml(c.telefono || 'â')}</td>
      <td>${escapeHtml(c.phone_number_id || 'â')}</td>
      <td>${c.activo ? '<span class="tag tag-baja">Activo</span>' : '<span class="tag tag-alta">Inactivo</span>'}</td>
      <td style="font-size:11px; max-width:260px; word-break:break-all;">${escapeHtml(origin + '/webhook/whatsapp/' + c.id)}<br><span class="muted">verify_token: ${escapeHtml(c.verify_token || 'â')}</span></td>
      <td><button class="btn btn-sm cw-edit">Editar</button> <button class="btn btn-sm btn-danger cw-delete">Eliminar</button></td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted" style="text-align:center; padding:24px;">Sin nÃºmeros configurados.</td></tr>`;

  $all('.cw-edit', wspBody).forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.target.closest('tr').dataset.id;
    openCanalWspModal(wsp.find(c => c.id === id));
  }));
  $all('.cw-delete', wspBody).forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('Â¿Eliminar este nÃºmero de WhatsApp?')) return;
    try {
      await api('DELETE', '/api/canales/whatsapp/' + id);
      showToast('Canal eliminado.', 'success');
      renderCanales();
    } catch (err) { showToast(err.message, 'error'); }
  }));

  const emailBody = $('#canales-email-table tbody');
  emailBody.innerHTML = email.map(c => `
    <tr data-id="${c.id}">
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td>${escapeHtml(c.direccion)}</td>
      <td>${escapeHtml(c.proveedor)}</td>
      <td>${c.activo ? '<span class="tag tag-baja">Activo</span>' : '<span class="tag tag-alta">Inactivo</span>'}</td>
      <td style="font-size:11px; max-width:260px; word-break:break-all;">${escapeHtml(origin + '/webhook/email/' + c.id)}<br><span class="muted">secret: ${escapeHtml(c.webhook_secret || 'â')}</span></td>
      <td><button class="btn btn-sm ce-edit">Editar</button> <button class="btn btn-sm btn-danger ce-delete">Eliminar</button></td>
    </tr>
  `).join('') || `<tr><td colspan="6" class="muted" style="text-align:center; padding:24px;">Sin cuentas configuradas.</td></tr>`;

  $all('.ce-edit', emailBody).forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.target.closest('tr').dataset.id;
    openCanalEmailModal(email.find(c => c.id === id));
  }));
  $all('.ce-delete', emailBody).forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('Â¿Eliminar esta cuenta de email?')) return;
    try {
      await api('DELETE', '/api/canales/email/' + id);
      showToast('Canal eliminado.', 'success');
      renderCanales();
    } catch (err) { showToast(err.message, 'error'); }
  }));
}

function openCanalWspModal(canal) {
  const isNew = !canal;
  const data = canal || { nombre: '', telefono: '', phone_number_id: '', waba_id: '', access_token: '', verify_token: '', activo: 1 };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nuevo nÃºmero de WhatsApp' : 'Editar nÃºmero de WhatsApp'}</h2>
    <div class="field">
      <label>Nombre interno</label>
      <input type="text" id="cw-nombre" value="${escapeHtml(data.nombre)}" placeholder="Ej: AtenciÃ³n Norte">
    </div>
    <div class="field-row">
      <div class="field">
        <label>TelÃ©fono visible</label>
        <input type="text" id="cw-telefono" value="${escapeHtml(data.telefono || '')}" placeholder="+56 9 0000 0000">
      </div>
      <div class="field">
        <label>Estado</label>
        <select id="cw-activo">
          <option value="1" ${data.activo ? 'selected' : ''}>Activo</option>
          <option value="0" ${!data.activo ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Phone Number ID (Meta Cloud API)</label>
      <input type="text" id="cw-phoneid" value="${escapeHtml(data.phone_number_id || '')}">
    </div>
    <div class="field">
      <label>WABA ID</label>
      <input type="text" id="cw-wabaid" value="${escapeHtml(data.waba_id || '')}">
    </div>
    <div class="field">
      <label>Token de acceso permanente</label>
      <input type="text" id="cw-token" value="${escapeHtml(data.access_token || '')}" placeholder="EAAxxxxx...">
    </div>
    <div class="field">
      <label>Token de verificaciÃ³n del webhook</label>
      <input type="text" id="cw-verify" value="${escapeHtml(data.verify_token || '')}">
    </div>
    <div class="modal-actions">
      <button class="btn" id="cw-cancel">Cancelar</button>
      <button class="btn btn-primary" id="cw-save">${isNew ? 'Agregar' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#cw-cancel').addEventListener('click', closeModal);

  $('#cw-save').addEventListener('click', async () => {
    const payload = {
      nombre: $('#cw-nombre').value.trim(),
      telefono: $('#cw-telefono').value.trim(),
      phoneNumberId: $('#cw-phoneid').value.trim(),
      wabaId: $('#cw-wabaid').value.trim(),
      accessToken: $('#cw-token').value.trim(),
      verifyToken: $('#cw-verify').value.trim(),
      activo: $('#cw-activo').value === '1'
    };
    if (!payload.nombre) { showToast('El nombre es obligatorio.', 'error'); return; }
    try {
      if (isNew) {
        await api('POST', '/api/canales/whatsapp', payload);
        showToast('NÃºmero agregado.', 'success');
      } else {
        await api('PUT', '/api/canales/whatsapp/' + canal.id, payload);
        showToast('Canal actualizado.', 'success');
      }
      closeModal();
      renderCanales();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

function openCanalEmailModal(canal) {
  const isNew = !canal;
  const data = canal || { nombre: '', direccion: '', proveedor: 'resend', api_key: '', dominio: '', webhook_secret: '', activo: 1 };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nueva cuenta de email' : 'Editar cuenta de email'}</h2>
    <div class="field">
      <label>Nombre interno</label>
      <input type="text" id="ce-nombre" value="${escapeHtml(data.nombre)}" placeholder="Ej: Soporte">
    </div>
    <div class="field-row">
      <div class="field">
        <label>DirecciÃ³n de correo</label>
        <input type="email" id="ce-direccion" value="${escapeHtml(data.direccion || '')}" placeholder="soporte@tomalo.cl">
      </div>
      <div class="field">
        <label>Estado</label>
        <select id="ce-activo">
          <option value="1" ${data.activo ? 'selected' : ''}>Activo</option>
          <option value="0" ${!data.activo ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Proveedor de envÃ­o</label>
      <select id="ce-proveedor">
        <option value="resend" ${data.proveedor === 'resend' ? 'selected' : ''}>Resend</option>
        <option value="sendgrid" ${data.proveedor === 'sendgrid' ? 'selected' : ''}>SendGrid</option>
        <option value="mailgun" ${data.proveedor === 'mailgun' ? 'selected' : ''}>Mailgun</option>
      </select>
    </div>
    <div class="field">
      <label>API Key</label>
      <input type="text" id="ce-apikey" value="${escapeHtml(data.api_key || '')}">
    </div>
    <div class="field">
      <label>Dominio (solo Mailgun)</label>
      <input type="text" id="ce-dominio" value="${escapeHtml(data.dominio || '')}" placeholder="mg.tomalo.cl">
    </div>
    <div class="field">
      <label>Secret del webhook entrante</label>
      <input type="text" id="ce-secret" value="${escapeHtml(data.webhook_secret || '')}">
    </div>
    <div class="modal-actions">
      <button class="btn" id="ce-cancel">Cancelar</button>
      <button class="btn btn-primary" id="ce-save">${isNew ? 'Agregar' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#ce-cancel').addEventListener('click', closeModal);

  $('#ce-save').addEventListener('click', async () => {
    const payload = {
      nombre: $('#ce-nombre').value.trim(),
      direccion: $('#ce-direccion').value.trim(),
      proveedor: $('#ce-proveedor').value,
      apiKey: $('#ce-apikey').value.trim(),
      dominio: $('#ce-dominio').value.trim(),
      webhookSecret: $('#ce-secret').value.trim(),
      activo: $('#ce-activo').value === '1'
    };
    if (!payload.nombre || !payload.direccion) { showToast('Nombre y direcciÃ³n son obligatorios.', 'error'); return; }
    try {
      if (isNew) {
        await api('POST', '/api/canales/email', payload);
        showToast('Cuenta agregada.', 'success');
      } else {
        await api('PUT', '/api/canales/email/' + canal.id, payload);
        showToast('Canal actualizado.', 'success');
      }
      closeModal();
      renderCanales();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// USUARIOS (ADMIN)
// ============================================================
async function renderUsuarios() {
  const usuarios = await getUsuarios(true);

  const btnNew = $('#btn-new-usuario');
  if (!btnNew.dataset.filled) {
    btnNew.dataset.filled = '1';
    btnNew.addEventListener('click', () => openUsuarioModal(null));
  }

  const tbody = $('#usuarios-table tbody');
  tbody.innerHTML = usuarios.map(u => `
    <tr data-id="${u.id}">
      <td><strong>${escapeHtml(u.nombre)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="tag tag-naranjo">${escapeHtml(u.rol)}</span></td>
      <td>${u.activo ? '<span class="tag tag-baja">Activo</span>' : '<span class="tag tag-alta">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-sm u-edit">Editar</button>
        ${u.id !== state.user.id ? '<button class="btn btn-sm btn-danger u-delete">Eliminar</button>' : ''}
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="muted" style="text-align:center; padding:24px;">Sin usuarios.</td></tr>`;

  $all('.u-edit', tbody).forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.target.closest('tr').dataset.id;
    openUsuarioModal(usuarios.find(u => u.id === id));
  }));
  $all('.u-delete', tbody).forEach(btn => btn.addEventListener('click', async (e) => {
    const id = e.target.closest('tr').dataset.id;
    if (!confirm('Â¿Eliminar este usuario?')) return;
    try {
      await api('DELETE', '/api/usuarios/' + id);
      showToast('Usuario eliminado.', 'success');
      renderUsuarios();
    } catch (err) { showToast(err.message, 'error'); }
  }));
}

function openUsuarioModal(usuario) {
  const isNew = !usuario;
  const data = usuario || { nombre: '', email: '', rol: 'agente', activo: 1 };

  openModal(`
    <button class="modal-close" id="modal-close">Ã</button>
    <h2>${isNew ? 'Nuevo usuario' : 'Editar usuario'}</h2>
    <div class="field">
      <label>Nombre</label>
      <input type="text" id="u-nombre" value="${escapeHtml(data.nombre)}">
    </div>
    <div class="field">
      <label>Email</label>
      <input type="email" id="u-email" value="${escapeHtml(data.email)}" ${isNew ? '' : 'disabled'}>
    </div>
    <div class="field-row">
      <div class="field">
        <label>Rol</label>
        <select id="u-rol">
          <option value="admin" ${data.rol === 'admin' ? 'selected' : ''}>Admin</option>
          <option value="comercial" ${data.rol === 'comercial' ? 'selected' : ''}>Comercial</option>
          <option value="agente" ${data.rol === 'agente' ? 'selected' : ''}>Agente</option>
        </select>
      </div>
      <div class="field">
        <label>Estado</label>
        <select id="u-activo">
          <option value="1" ${data.activo ? 'selected' : ''}>Activo</option>
          <option value="0" ${!data.activo ? 'selected' : ''}>Inactivo</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>${isNew ? 'ContraseÃ±a' : 'Nueva contraseÃ±a (dejar en blanco para no cambiar)'}</label>
      <input type="password" id="u-password">
    </div>
    <div class="modal-actions">
      <button class="btn" id="u-cancel">Cancelar</button>
      <button class="btn btn-primary" id="u-save">${isNew ? 'Crear usuario' : 'Guardar cambios'}</button>
    </div>
  `);

  $('#modal-close').addEventListener('click', closeModal);
  $('#u-cancel').addEventListener('click', closeModal);

  $('#u-save').addEventListener('click', async () => {
    const payload = {
      nombre: $('#u-nombre').value.trim(),
      rol: $('#u-rol').value,
      activo: $('#u-activo').value === '1'
    };
    const password = $('#u-password').value;
    if (isNew) {
      payload.email = $('#u-email').value.trim();
      payload.password = password;
      if (!payload.nombre || !payload.email || !payload.password) {
        showToast('Nombre, email y contraseÃ±a son obligatorios.', 'error'); return;
      }
    } else if (password) {
      payload.password = password;
    }
    try {
      if (isNew) {
        await api('POST', '/api/usuarios', payload);
        showToast('Usuario creado.', 'success');
      } else {
        await api('PUT', '/api/usuarios/' + usuario.id, payload);
        showToast('Usuario actualizado.', 'success');
      }
      closeModal();
      renderUsuarios();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ============================================================
// INICIALIZACIÃN
// ============================================================
async function init() {
  if (!state.token) {
    showLogin();
    return;
  }
  try {
    const result = await api('GET', '/api/auth/me');
    state.user = result.user;
    localStorage.setItem('tomalo_user', JSON.stringify(state.user));
    showApp();
    switchView('dashboard');
  } catch (err) {
    showLogin();
  }
}

init();
