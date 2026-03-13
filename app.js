// ============================================
// Pedidos GrupoMark — Lógica completa
// ============================================

// --- Configuración ---
const DOLIBARR_URL = 'http://192.168.1.115/dolibarr/api/index.php';
const DOLAPIKEY = 'qYjDhKFcO4nJ';

const LS_KEYS = {
  PRODUCTOS: 'productos',
  CLIENTES: 'clientes',
  PEDIDOS: 'pedidos',
  ULTIMA_SYNC: 'ultima_sync'
};

// --- Datos de prueba (se cargan si localStorage está vacío) ---
const PRODUCTOS_PRUEBA = [
  { ref: '3124', label: 'Peineta para clipper #2', description: '' },
  { ref: '1062-1108', label: 'Cuchilla WAHL T-Shaped', description: '' },
  { ref: '717151', label: 'Capa para corte negra con diseños', description: '' },
  { ref: 'ABC-001', label: 'Producto de prueba uno', description: '' },
  { ref: 'ABC-002', label: 'Producto de prueba dos', description: '' }
];

const CLIENTES_PRUEBA = [
  { id: '1', nom: 'GRUPO MARK SOCIEDAD ANONIMA' },
  { id: '2', nom: 'ENCOSA ENDURA COSMETICS' },
  { id: '3', nom: 'Ferretería El Martillo' },
  { id: '4', nom: 'Electrónica San José' }
];

function cargarDatosDePruebaSiVacio() {
  const prods = JSON.parse(localStorage.getItem(LS_KEYS.PRODUCTOS) || '[]');
  if (prods.length === 0) {
    console.log('[Init] localStorage de productos vacío — cargando datos de prueba');
    localStorage.setItem(LS_KEYS.PRODUCTOS, JSON.stringify(PRODUCTOS_PRUEBA));
  }
  const clis = JSON.parse(localStorage.getItem(LS_KEYS.CLIENTES) || '[]');
  if (clis.length === 0) {
    console.log('[Init] localStorage de clientes vacío — cargando datos de prueba');
    localStorage.setItem(LS_KEYS.CLIENTES, JSON.stringify(CLIENTES_PRUEBA));
  }
}

const CURRENT_VERSION = 'v7';

function limpiarCacheViejo() {
  const v = localStorage.getItem('app_version');
  if (v !== CURRENT_VERSION) {
    console.log('[App] Actualizando a ' + CURRENT_VERSION + ' — limpiando caché de productos y clientes');
    localStorage.removeItem(LS_KEYS.PRODUCTOS);
    localStorage.removeItem(LS_KEYS.CLIENTES);
    localStorage.setItem('app_version', CURRENT_VERSION);
  }
}

function diagnosticoInicial() {
  const prods = JSON.parse(localStorage.getItem(LS_KEYS.PRODUCTOS) || '[]');
  const clis = JSON.parse(localStorage.getItem(LS_KEYS.CLIENTES) || '[]');
  console.log('[Diag] Productos en localStorage:', prods.length);
  console.log('[Diag] Primeros 2 productos:', prods.slice(0, 2));
  console.log('[Diag] Clientes en localStorage:', clis.length);
  console.log('[Diag] Primeros 2 clientes:', clis.slice(0, 2));
}

// --- Estado de la app ---
let productoSeleccionado = null;   // { ref, label }
let clienteSeleccionado = null;    // { id, nom }
let itemsPedido = [];              // [{ codigo, descripcion, cantidad }]

// ============================================
// NAVEGACIÓN ENTRE PANTALLAS
// ============================================

function navegarA(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');

  if (screenId === 'screen-home') {
    actualizarInfoSync();
  }
  if (screenId === 'screen-pedido') {
    limpiarFormularioPedido();
  }
  if (screenId === 'screen-guardados') {
    renderPedidosGuardados();
  }

  window.scrollTo(0, 0);
}

// ============================================
// SINCRONIZACIÓN CON DOLIBARR
// ============================================

function mostrarSpinner(texto) {
  const overlay = document.getElementById('spinner-overlay');
  const textEl = document.getElementById('spinner-text');
  textEl.textContent = texto || 'Sincronizando...';
  overlay.classList.add('show');
}

function ocultarSpinner() {
  document.getElementById('spinner-overlay').classList.remove('show');
}

function mostrarToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

async function sincronizarProductos() {
  const url = `${DOLIBARR_URL}/products?limit=5000&sortfield=ref&sortorder=ASC`;
  console.log('[Sync] Llamando a:', url);
  const resp = await fetch(url, {
    headers: {
      'DOLAPIKEY': DOLAPIKEY,
      'Accept': 'application/json'
    }
  });
  if (!resp.ok) throw new Error(`Error productos: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  console.log('[Sync] Respuesta productos — total:', data.length, '— primeros 3:', data.slice(0, 3));
  // Guardar ref, label y description con fallback
  const productos = data.map(p => ({
    ref: p.ref || '',
    label: p.label || p.description || p.ref || 'Sin nombre',
    description: p.description || ''
  }));
  localStorage.setItem(LS_KEYS.PRODUCTOS, JSON.stringify(productos));
  return productos.length;
}

async function sincronizarClientes() {
  const url = `${DOLIBARR_URL}/thirdparties?limit=2000&sortfield=nom&sortorder=ASC`;
  console.log('[Sync] Llamando a:', url);
  const resp = await fetch(url, {
    headers: {
      'DOLAPIKEY': DOLAPIKEY,
      'Accept': 'application/json'
    }
  });
  if (!resp.ok) throw new Error(`Error clientes: ${resp.status} ${resp.statusText}`);
  const data = await resp.json();
  console.log('[Sync] Total terceros recibidos:', data.length);
  // Mostrar los campos de cada tercero para diagnóstico
  data.forEach(c => console.log(`  → ${c.nom} | client=${c.client} | fournisseur=${c.fournisseur}`));
  // Filtrar SOLO clientes puros (client=1), excluir proveedores
  const soloClientes = data.filter(c => {
    const clientVal = parseInt(c.client) || 0;
    const provVal = parseInt(c.fournisseur) || 0;
    return clientVal >= 1 && provVal === 0;
  });
  console.log('[Sync] Solo clientes (sin proveedores):', soloClientes.length);
  const clientes = soloClientes.map(c => ({
    id: c.id,
    nom: c.nom || c.name || c.ref || 'Sin nombre'
  }));
  localStorage.setItem(LS_KEYS.CLIENTES, JSON.stringify(clientes));
  return clientes.length;
}

async function sincronizarTodo() {
  mostrarSpinner('Sincronizando productos...');
  try {
    const numProd = await sincronizarProductos();
    mostrarSpinner('Sincronizando clientes...');
    const numCli = await sincronizarClientes();

    // Guardar timestamp
    const ahora = new Date().toISOString();
    localStorage.setItem(LS_KEYS.ULTIMA_SYNC, ahora);

    ocultarSpinner();
    actualizarInfoSync();
    mostrarToast(`✅ ${numProd} productos · ${numCli} clientes sincronizados`);
  } catch (err) {
    ocultarSpinner();
    console.error('[Sync]', err);
    mostrarToast('❌ Error al sincronizar: ' + err.message);
  }
}

function actualizarInfoSync() {
  const productos = JSON.parse(localStorage.getItem(LS_KEYS.PRODUCTOS) || '[]');
  const ultimaSync = localStorage.getItem(LS_KEYS.ULTIMA_SYNC);

  document.getElementById('sync-count').textContent = productos.length;
  document.getElementById('sync-date').textContent = ultimaSync
    ? formatearFecha(ultimaSync)
    : 'Nunca';
}

function formatearFecha(isoStr) {
  const d = new Date(isoStr);
  const dia = d.getDate().toString().padStart(2, '0');
  const mes = (d.getMonth() + 1).toString().padStart(2, '0');
  const anio = d.getFullYear();
  const hora = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${dia}/${mes}/${anio} ${hora}:${min}`;
}

// ============================================
// BÚSQUEDA DE CLIENTES
// ============================================

// Referencias al DOM — se inicializan en DOMContentLoaded
let inputCliente = null;
let dropdownClientes = null;
let clienteChipContainer = null;
let clienteWrapper = null;

function seleccionarCliente(nombre) {
  clienteSeleccionado = { nom: nombre };
  dropdownClientes.classList.remove('show');
  inputCliente.value = '';
  clienteWrapper.style.display = 'none';
  clienteChipContainer.innerHTML = `
    <div class="chip">
      ${escaparHTML(nombre)}
      <span class="chip-remove" onclick="quitarCliente()">✕</span>
    </div>
  `;
}

function quitarCliente() {
  clienteSeleccionado = null;
  clienteChipContainer.innerHTML = '';
  clienteWrapper.style.display = 'block';
  inputCliente.value = '';
  inputCliente.focus();
}

// ============================================
// BÚSQUEDA DE PRODUCTOS (TAB CATÁLOGO)
// ============================================

// Referencias al DOM — se inicializan en DOMContentLoaded
let inputProducto = null;
let dropdownProductos = null;

function seleccionarProducto(ref, label) {
  productoSeleccionado = { ref, label };
  dropdownProductos.classList.remove('show');
  inputProducto.value = '';

  const el = document.getElementById('selected-product');
  document.getElementById('sp-code').textContent = ref;
  document.getElementById('sp-name').textContent = ' — ' + label;
  el.classList.add('show');
}

function limpiarSeleccionProducto() {
  productoSeleccionado = null;
  document.getElementById('selected-product').classList.remove('show');
  document.getElementById('sp-code').textContent = '';
  document.getElementById('sp-name').textContent = '';
  inputProducto.value = '';
}

// ============================================
// TABS
// ============================================

function cambiarTab(tabBtn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  tabBtn.classList.add('active');
  const targetId = tabBtn.getAttribute('data-tab');
  document.getElementById(targetId).classList.add('active');

  // Limpiar selección al cambiar tab
  limpiarSeleccionProducto();
  document.getElementById('input-codigo-libre').value = '';
  document.getElementById('input-desc-libre').value = '';
}

// ============================================
// CONTROL DE CANTIDAD
// ============================================

function cambiarCantidad(delta) {
  const input = document.getElementById('input-cantidad');
  let val = parseInt(input.value) || 1;
  val = Math.max(1, val + delta);
  input.value = val;
}

// ============================================
// AGREGAR PRODUCTO AL PEDIDO
// ============================================

function agregarProducto() {
  const cantidad = parseInt(document.getElementById('input-cantidad').value) || 1;
  let codigo = '';
  let descripcion = '';

  // Determinar cuál tab está activa
  const tabCatalogo = document.getElementById('tab-catalogo');
  if (tabCatalogo.classList.contains('active')) {
    // Tab catálogo
    if (!productoSeleccionado) {
      mostrarToast('⚠️ Selecciona un producto del catálogo');
      return;
    }
    codigo = productoSeleccionado.ref;
    descripcion = productoSeleccionado.label;
  } else {
    // Tab texto libre
    codigo = document.getElementById('input-codigo-libre').value.trim();
    descripcion = document.getElementById('input-desc-libre').value.trim();
    if (!codigo && !descripcion) {
      mostrarToast('⚠️ Escribe un código o descripción');
      return;
    }
    if (!codigo) codigo = '—';
  }

  // Si el código ya existe, sumar cantidad
  const existente = itemsPedido.find(item => item.codigo === codigo);
  if (existente) {
    existente.cantidad += cantidad;
  } else {
    itemsPedido.push({ codigo, descripcion, cantidad });
  }

  renderTablaPedido();
  limpiarSeleccionProducto();
  document.getElementById('input-codigo-libre').value = '';
  document.getElementById('input-desc-libre').value = '';
  document.getElementById('input-cantidad').value = 1;
  mostrarToast(`✅ ${codigo} × ${cantidad} añadido`);
}

// ============================================
// RENDERIZAR TABLA DEL PEDIDO
// ============================================

function renderTablaPedido() {
  const tbody = document.getElementById('tbody-pedido');
  const emptyMsg = document.getElementById('empty-msg');

  if (itemsPedido.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  tbody.innerHTML = itemsPedido.map((item, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-code">${escaparHTML(item.codigo)}</td>
      <td>${escaparHTML(item.descripcion)}</td>
      <td class="col-qty">${item.cantidad}</td>
      <td class="col-actions">
        <button onclick="eliminarItem(${i})" title="Eliminar">✕</button>
      </td>
    </tr>
  `).join('');
}

function eliminarItem(index) {
  itemsPedido.splice(index, 1);
  renderTablaPedido();
}

// ============================================
// LIMPIAR FORMULARIO DE PEDIDO
// ============================================

function limpiarFormularioPedido() {
  // No limpiar si hay items — permitir navegación de ida y vuelta
  // Solo limpiar los campos de entrada
  limpiarSeleccionProducto();
  document.getElementById('input-codigo-libre').value = '';
  document.getElementById('input-desc-libre').value = '';
  document.getElementById('input-cantidad').value = 1;
}

// ============================================
// GENERAR PDF CON jsPDF
// ============================================

function generarPDF(pedidoData) {
  // Si se pasa un pedido guardado, usarlo; si no, usar el estado actual
  const items = pedidoData ? pedidoData.items : itemsPedido;
  const cliente = pedidoData
    ? pedidoData.cliente
    : (clienteSeleccionado ? clienteSeleccionado.nom : inputCliente.value.trim() || 'Sin cliente');
  const fecha = pedidoData ? pedidoData.fecha : new Date().toISOString();

  if (items.length === 0) {
    mostrarToast('⚠️ Agrega productos al pedido primero');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let y = 16;

  // --- Encabezado ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 109, 59);
  doc.text('GrupoMark', margin, y);

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text('Pedido de Ventas', margin, y + 7);

  // Fecha (derecha)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  const fechaStr = formatearFecha(fecha);
  doc.text(`Fecha: ${fechaStr}`, pageWidth - margin, y, { align: 'right' });

  y += 16;

  // --- Cliente ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(`Cliente: ${cliente}`, margin, y);
  y += 10;

  // --- Línea separadora ---
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // --- Tabla encabezados ---
  const colX = {
    cant: margin,
    codigo: margin + 18,
    desc: margin + 55,
    juntado: pageWidth - margin - 40,
    revisado: pageWidth - margin - 25,
    factura: pageWidth - margin - 10
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Cantidad', colX.cant, y);
  doc.text('Código', colX.codigo, y);
  doc.text('Descripción', colX.desc, y);
  doc.text('Juntado', colX.juntado, y);
  doc.text('Revisado', colX.revisado, y);
  doc.text('Factura', colX.factura, y);

  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // --- Filas ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);

  const checkboxSize = 3.5;

  items.forEach((item, i) => {
    // Verificar salto de página
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    // Cantidad — negrita + naranja
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 109, 59);
    doc.text(`${item.cantidad}`, colX.cant, y);

    // Código — negrita
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text(item.codigo, colX.codigo, y);

    // Descripción — normal, truncar a 40 caracteres
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    const descMaxLen = 40;
    const descText = item.descripcion.length > descMaxLen
      ? item.descripcion.substring(0, descMaxLen) + '...'
      : item.descripcion;
    doc.text(descText, colX.desc, y);

    // Checkboxes vacíos — Juntado, Revisado y Factura
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    const cbY = y - checkboxSize + 0.5;
    doc.rect(colX.juntado + 2, cbY, checkboxSize, checkboxSize);
    doc.rect(colX.revisado + 2, cbY, checkboxSize, checkboxSize);
    doc.rect(colX.factura + 2, cbY, checkboxSize, checkboxSize);

    y += 7;

    // Línea fina entre filas
    doc.setDrawColor(240, 240, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  });

  y += 6;

  // --- Total ---
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  const totalCant = items.reduce((sum, item) => sum + item.cantidad, 0);
  doc.text(`Total: ${items.length} líneas · ${totalCant} unidades`, margin, y);

  // --- Descargar y Abrir PDF ---
  const fechaDoc = new Date(fecha);
  const dia = String(fechaDoc.getDate()).padStart(2, '0');
  const mes = String(fechaDoc.getMonth() + 1).padStart(2, '0');
  const anio = String(fechaDoc.getFullYear()).slice(-2);
  
  // Limpiar nombre del cliente para archivo (quitar espacios y caracteres raros)
  const nombreLimpio = cliente.replace(/[^a-zA-Z0-9]/g, '_').replace(/_{2,}/g, '_');
  const nombreArchivo = `Pedido_${nombreLimpio}_${dia}-${mes}-${anio}.pdf`;
  
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);

  // Descargar
  const link = document.createElement('a');
  link.href = pdfUrl;
  link.download = nombreArchivo;
  link.click();

  // Abrir en pestaña nueva
  window.open(pdfUrl, '_blank');
}

// ============================================
// GUARDAR PEDIDO
// ============================================

function guardarPedido() {
  if (itemsPedido.length === 0) {
    mostrarToast('⚠️ Agrega productos antes de guardar');
    return;
  }

  const cliente = clienteSeleccionado
    ? clienteSeleccionado.nom
    : (inputCliente.value.trim() || 'Sin cliente');

  const pedido = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    cliente: cliente,
    fecha: new Date().toISOString(),
    items: [...itemsPedido]
  };

  const pedidos = JSON.parse(localStorage.getItem(LS_KEYS.PEDIDOS) || '[]');
  pedidos.unshift(pedido);
  localStorage.setItem(LS_KEYS.PEDIDOS, JSON.stringify(pedidos));

  mostrarToast('💾 Pedido guardado correctamente');

  // Limpiar estado del pedido actual
  itemsPedido = [];
  clienteSeleccionado = null;
  clienteChipContainer.innerHTML = '';
  clienteWrapper.style.display = 'block';
  inputCliente.value = '';
  renderTablaPedido();
  navegarA('screen-home');
}

// ============================================
// PEDIDOS GUARDADOS
// ============================================

function renderPedidosGuardados() {
  const container = document.getElementById('lista-guardados');
  const pedidos = JSON.parse(localStorage.getItem(LS_KEYS.PEDIDOS) || '[]');
  const emptyMsg = document.getElementById('empty-guardados');

  if (pedidos.length === 0) {
    container.innerHTML = '';
    container.appendChild(emptyMsg);
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  container.innerHTML = pedidos.map((p, i) => `
    <div class="order-item">
      <div class="order-info">
        <h3>${escaparHTML(p.cliente)}</h3>
        <p>${formatearFecha(p.fecha)} · ${p.items.length} producto${p.items.length > 1 ? 's' : ''}</p>
      </div>
      <div class="order-actions">
        <button class="btn btn-sm btn-secondary" onclick="regenerarPDF(${i})" title="Generar PDF">📄</button>
        <button class="btn btn-sm btn-danger" onclick="eliminarPedido(${i})" title="Eliminar">🗑</button>
      </div>
    </div>
  `).join('');
}

function regenerarPDF(index) {
  const pedidos = JSON.parse(localStorage.getItem(LS_KEYS.PEDIDOS) || '[]');
  if (pedidos[index]) {
    generarPDF(pedidos[index]);
  }
}

function eliminarPedido(index) {
  const pedidos = JSON.parse(localStorage.getItem(LS_KEYS.PEDIDOS) || '[]');
  pedidos.splice(index, 1);
  localStorage.setItem(LS_KEYS.PEDIDOS, JSON.stringify(pedidos));
  renderPedidosGuardados();
  mostrarToast('🗑 Pedido eliminado');
}

// ============================================
// UTILIDADES
// ============================================

function escaparHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] ✅ app.js v7 cargado correctamente');

  try {
    limpiarCacheViejo();
    cargarDatosDePruebaSiVacio();
    diagnosticoInicial();
    actualizarInfoSync();
  } catch (e) {
    console.error('[App] Error en inicialización:', e);
  }

  // --- Inicializar referencias al DOM ---
  inputCliente = document.getElementById('input-cliente');
  dropdownClientes = document.getElementById('dropdown-clientes');
  clienteChipContainer = document.getElementById('cliente-chip-container');
  clienteWrapper = document.getElementById('cliente-wrapper');
  inputProducto = document.getElementById('input-producto');
  dropdownProductos = document.getElementById('dropdown-productos');

  // Verificar que todos los elementos existen
  console.log('[App] inputCliente:', inputCliente ? '✅' : '❌ NULL');
  console.log('[App] dropdownClientes:', dropdownClientes ? '✅' : '❌ NULL');
  console.log('[App] inputProducto:', inputProducto ? '✅' : '❌ NULL');
  console.log('[App] dropdownProductos:', dropdownProductos ? '✅' : '❌ NULL');

  if (!inputCliente || !dropdownClientes || !inputProducto || !dropdownProductos) {
    console.error('[App] ❌ Elementos del DOM no encontrados. Abortando listeners.');
    return;
  }

  // --- Listener: búsqueda de clientes ---
  inputCliente.addEventListener('input', () => {
    const query = inputCliente.value.trim().toLowerCase();
    console.log('[App] Buscando cliente:', query);

    if (query.length < 1) {
      dropdownClientes.classList.remove('show');
      return;
    }

    const clientes = JSON.parse(localStorage.getItem(LS_KEYS.CLIENTES) || '[]');
    console.log('[App] Clientes disponibles:', clientes.length);

    if (clientes.length === 0) {
      dropdownClientes.innerHTML = '<div class="dropdown-item" style="color:#dc2626;cursor:default;">⚠️ Sin datos. Toca \'Actualizar productos\' para sincronizar.</div>';
      dropdownClientes.classList.add('show');
      return;
    }

    const filtrados = clientes.filter(c =>
      (c.nom || '').toLowerCase().includes(query)
    ).slice(0, 20);

    console.log('[App] Clientes filtrados:', filtrados.length);

    if (filtrados.length === 0) {
      dropdownClientes.innerHTML = '<div class="dropdown-item" style="color:#999;cursor:default;">No se encontraron resultados</div>';
      dropdownClientes.classList.add('show');
      return;
    }

    dropdownClientes.innerHTML = filtrados.map(c =>
      `<div class="dropdown-item" onclick="seleccionarCliente('${escaparHTML(c.nom)}')">${escaparHTML(c.nom)}</div>`
    ).join('');
    dropdownClientes.classList.add('show');
  });

  // --- Listener: cerrar dropdowns al hacer clic fuera ---
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#cliente-wrapper')) {
      dropdownClientes.classList.remove('show');
    }
    if (!e.target.closest('#tab-catalogo')) {
      dropdownProductos.classList.remove('show');
    }
  });

  // --- Listener: búsqueda de productos ---
  inputProducto.addEventListener('input', () => {
    const query = inputProducto.value.trim().toLowerCase();
    console.log('[App] Buscando producto:', query);

    if (query.length < 1) {
      dropdownProductos.classList.remove('show');
      return;
    }

    const productos = JSON.parse(localStorage.getItem(LS_KEYS.PRODUCTOS) || '[]');
    console.log('[App] Productos disponibles:', productos.length);

    if (productos.length === 0) {
      dropdownProductos.innerHTML = '<div class="dropdown-item" style="color:#dc2626;cursor:default;">⚠️ Sin datos. Toca \'Actualizar productos\' para sincronizar.</div>';
      dropdownProductos.classList.add('show');
      return;
    }

    const filtrados = productos.filter(p =>
      (p.ref || '').toLowerCase().includes(query) ||
      (p.label || '').toLowerCase().includes(query) ||
      (p.description || '').toLowerCase().includes(query)
    ).slice(0, 25);

    console.log('[App] Productos filtrados:', filtrados.length);

    if (filtrados.length === 0) {
      dropdownProductos.innerHTML = '<div class="dropdown-item" style="color:#999;cursor:default;">No se encontraron resultados</div>';
      dropdownProductos.classList.add('show');
      return;
    }

    dropdownProductos.innerHTML = filtrados.map(p =>
      `<div class="dropdown-item" onclick="seleccionarProducto('${escaparHTML(p.ref)}', '${escaparHTML(p.label)}')">
        <span class="item-code">${escaparHTML(p.ref)}</span>
        <span class="item-name">${escaparHTML(p.label)}</span>
      </div>`
    ).join('');
    dropdownProductos.classList.add('show');
  });

  console.log('[App] ✅ Todos los listeners registrados correctamente');
});
