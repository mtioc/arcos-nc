// =============================================================================
// app.js — Arcos NC Hualpén
// Lee rutas_consolidadas.json (formato: { metadata: {...}, geometria: {...} })
// =============================================================================

let ARCOS = [];

// -----------------------------------------------------------------------------
// CARGA INICIAL
// -----------------------------------------------------------------------------

async function init() {
    try {
        const res = await fetch('rutas_consolidadas.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        // Normalizamos cada arco a una estructura plana para usar en la UI
        ARCOS = raw
            .map(normalizarArco)
            .filter(a => a.id); // ignoramos filas sin id
    } catch (e) {
        console.error('No se pudo cargar rutas_consolidadas.json', e);
        document.getElementById('lista').innerHTML =
            '<li class="vacio">Error al cargar los datos.<br>¿Está rutas_consolidadas.json en la misma carpeta?</li>';
        return;
    }

    poblarSelectores();
    bindEventos();
    renderLista(ARCOS);
}

/**
 * Convierte un registro crudo del JSON ({metadata, geometria})
 * a un objeto plano más cómodo para la UI.
 */
function normalizarArco(reg) {
    const m = reg.metadata || {};
    const geom = reg.geometria;

    const tiene_mapa = !!(geom && geom.coordinates && geom.coordinates.length >= 2);

    return {
        id:              (m.id || '').trim(),
        terminal_inicio: (m.terminal_inicio || '').trim(),
        terminal_fin:    (m.terminal_fin || '').trim(),
        servicio:        (m.servicio || '').trim() || null,
        sentido:         (m.sentido || '').trim() || null,
        calles:          parsearCalles(m.calles),
        notas:           (m.notas || '').trim() || null,
        coordenadas:     tiene_mapa ? geom.coordinates : null,
        tiene_mapa
    };
}

/**
 * Parsea la columna de calles del CSV.
 * Acepta separador '|' o ','. Si hay '|', usa ese (mejor para nombres con coma).
 */
function parsearCalles(s) {
    if (!s || !s.trim()) return [];
    const sep = s.includes('|') ? '|' : ',';
    return s.split(sep).map(c => c.trim()).filter(Boolean);
}

// -----------------------------------------------------------------------------
// POBLAR SELECTORES DE FILTRO
// -----------------------------------------------------------------------------

function poblarSelectores() {
    const terminalesInicio = [...new Set(ARCOS.map(a => a.terminal_inicio).filter(Boolean))].sort();
    const terminalesFin    = [...new Set(ARCOS.map(a => a.terminal_fin).filter(Boolean))].sort();
    const servicios        = [...new Set(ARCOS.map(a => a.servicio).filter(Boolean))].sort();

    poblarSelect('filtro-terminal-inicio', terminalesInicio);
    poblarSelect('filtro-terminal-fin',    terminalesFin);
    poblarSelect('filtro-servicio',        servicios);
}

function poblarSelect(id, valores) {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (valores.length === 0) {
        sel.disabled = true;
        return;
    }
    valores.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
}

// -----------------------------------------------------------------------------
// EVENTOS
// -----------------------------------------------------------------------------

function bindEventos() {
    document.getElementById('busqueda').addEventListener('input', filtrar);
    document.getElementById('filtro-terminal-inicio').addEventListener('change', filtrar);
    document.getElementById('filtro-terminal-fin').addEventListener('change', filtrar);
    document.getElementById('filtro-servicio').addEventListener('change', filtrar);
    document.getElementById('limpiar').addEventListener('click', limpiarFiltros);
    document.getElementById('btn-volver').addEventListener('click', volverALista);
}

// -----------------------------------------------------------------------------
// FILTRADO
// -----------------------------------------------------------------------------

function filtrar() {
    const q  = document.getElementById('busqueda').value.toLowerCase().trim();
    const ti = document.getElementById('filtro-terminal-inicio').value;
    const tf = document.getElementById('filtro-terminal-fin').value;
    const sv = document.getElementById('filtro-servicio').value;

    const filtrados = ARCOS.filter(a => {
        if (ti && a.terminal_inicio !== ti) return false;
        if (tf && a.terminal_fin !== tf)    return false;
        if (sv && a.servicio !== sv)        return false;
        if (q) {
            const hay = [
                a.terminal_inicio,
                a.terminal_fin,
                a.servicio,
                ...(a.calles || [])
            ].filter(Boolean).join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });

    renderLista(filtrados);
}

function limpiarFiltros() {
    document.getElementById('busqueda').value = '';
    document.getElementById('filtro-terminal-inicio').value = '';
    document.getElementById('filtro-terminal-fin').value = '';
    document.getElementById('filtro-servicio').value = '';
    renderLista(ARCOS);
}

// -----------------------------------------------------------------------------
// RENDER LISTA
// -----------------------------------------------------------------------------

function renderLista(arcos) {
    const ul       = document.getElementById('lista');
    const contador = document.getElementById('contador');

    contador.textContent = `${arcos.length} arco${arcos.length === 1 ? '' : 's'}`;

    if (arcos.length === 0) {
        ul.innerHTML = '<li class="vacio">Ningún arco coincide con los filtros</li>';
        return;
    }

    // Construimos el HTML como string para evitar muchas creaciones DOM separadas
    ul.innerHTML = arcos.map(a => `
        <li class="arco-card" data-id="${a.id}">
            <div class="arco-ruta">
                <span>${escapar(a.terminal_inicio)}</span>
                <span class="arco-flecha">→</span>
                <span>${escapar(a.terminal_fin)}</span>
            </div>
            <div class="arco-meta">
                <span>${escapar(a.sentido) || '—'}</span>
                <span>${a.calles.length} calle${a.calles.length === 1 ? '' : 's'}</span>
                <span class="arco-meta-item ${a.tiene_mapa ? 'con-mapa' : 'sin-mapa'}">
                    ${a.tiene_mapa ? '● con mapa' : '○ sin mapa'}
                </span>
            </div>
            ${a.servicio ? `<span class="arco-servicio">${escapar(a.servicio)}</span>` : ''}
        </li>
    `).join('');

    // Bindeamos los clicks
    ul.querySelectorAll('.arco-card').forEach(card => {
        card.addEventListener('click', () => {
            const arco = ARCOS.find(a => a.id === card.dataset.id);
            if (arco) mostrarDetalle(arco);
        });
    });
}

// Pequeño helper para evitar XSS al insertar texto de los datos en HTML
function escapar(s) {
    if (!s) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// -----------------------------------------------------------------------------
// VISTA DETALLE
// -----------------------------------------------------------------------------

function mostrarDetalle(arco) {
    document.getElementById('vista-lista').classList.add('oculta');
    document.getElementById('vista-detalle').classList.remove('oculta');

    document.getElementById('detalle-titulo').textContent =
        `${arco.terminal_inicio} → ${arco.terminal_fin}`;

    const subt = [arco.sentido, arco.servicio].filter(Boolean).join(' · ');
    document.getElementById('detalle-subtitulo').textContent = subt || '—';

    // Lista de calles
    const ol = document.getElementById('lista-calles');
    ol.innerHTML = arco.calles
        .map(c => `<li>${escapar(c)}</li>`)
        .join('');

    // Notas (si hay)
    const notas = document.getElementById('notas');
    if (arco.notas) {
        notas.textContent = arco.notas;
        notas.classList.remove('oculto');
    } else {
        notas.classList.add('oculto');
    }

    window.scrollTo({ top: 0, behavior: 'instant' });
}

function volverALista() {
    document.getElementById('vista-detalle').classList.add('oculta');
    document.getElementById('vista-lista').classList.remove('oculta');
}

// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------

init();
