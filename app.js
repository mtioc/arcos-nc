// =============================================================================
// app.js — Arcos NC Hualpén
// Lee rutas_consolidadas.json (formato: { metadata: {...}, geometria: {...} })
// =============================================================================

let ARCOS = [];
let MAPA = null;
let CAPA_RUTA = null;
let CELULA_ACTIVA = '';   // '' = todas las células
let TERMINAL_INICIO_ACTIVO = '';  // '' = ninguno elegido todavía
let TERMINAL_FIN_ACTIVO = '';

// Alias para unificar células escritas distinto (mismo lugar, distinta forma).
// Agregá acá cualquier variante nueva que aparezca → forma canónica.
const ALIAS_CELULA = {
    'LL-SJ': 'SJ-LL',
};

function normalizarCelula(s) {
    if (!s) return null;
    const c = s.trim().toUpperCase();
    return ALIAS_CELULA[c] || c || null;
}

// -----------------------------------------------------------------------------
// CARGA INICIAL
// -----------------------------------------------------------------------------

async function init() {
    try {
        const res = await fetch('rutas_consolidadas.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        ARCOS = raw
            .map(normalizarArco)
            .filter(a => a.id);
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
        celula:          normalizarCelula(m.servicio),   // ← el campo "servicio" trae la célula
        sentido:         (m.sentido || '').trim() || null,
        calles:          parsearCalles(m.calles),
        notas:           (m.notas || '').trim() || null,
        // Opcionales: si los sumás al Excel/JSON, aparecen solos en el detalle.
        distancia_km:    m.distancia_km ?? null,
        duracion_min:    m.duracion_min ?? null,
        coordenadas:     tiene_mapa ? geom.coordinates : null,
        tiene_mapa
    };
}

function parsearCalles(s) {
    if (!s || !s.trim()) return [];
    const sep = s.includes('|') ? '|' : ',';
    return s.split(sep).map(c => c.trim()).filter(Boolean);
}

// -----------------------------------------------------------------------------
// POBLAR SELECTORES
// -----------------------------------------------------------------------------

function poblarSelectores() {
    renderCelulaPills();
    renderTerminalInicioPills();
    renderTerminalFinPills();
}

// Arcos que sobreviven a los filtros de niveles ANTERIORES al que se está armando.
// (para que cada nivel de pills muestre solo opciones que todavía tienen sentido)
function arcosHastaCelula() {
    return CELULA_ACTIVA ? ARCOS.filter(a => a.celula === CELULA_ACTIVA) : ARCOS;
}
function arcosHastaTerminalInicio() {
    const base = arcosHastaCelula();
    return TERMINAL_INICIO_ACTIVO ? base.filter(a => a.terminal_inicio === TERMINAL_INICIO_ACTIVO) : base;
}

// Nivel 1: célula
function renderCelulaPills() {
    const cont = document.getElementById('celulas');
    if (!cont) return;

    const celulas = [...new Set(ARCOS.map(a => a.celula).filter(Boolean))].sort();
    const opciones = ['', ...celulas];

    cont.innerHTML = opciones.map(c => `
        <button class="celula-pill ${c === CELULA_ACTIVA ? 'activa' : ''}" data-celula="${escapar(c)}">
            ${c ? escapar(c) : 'Todas'}
        </button>
    `).join('');

    cont.querySelectorAll('.celula-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            CELULA_ACTIVA = btn.dataset.celula;
            TERMINAL_INICIO_ACTIVO = '';
            TERMINAL_FIN_ACTIVO = '';
            renderCelulaPills();
            renderTerminalInicioPills();
            renderTerminalFinPills();
            filtrar();
        });
    });
}

// Nivel 2: terminal de inicio, acotado a la célula ya elegida
function renderTerminalInicioPills() {
    const bloque = document.getElementById('bloque-terminal-inicio');
    const cont = document.getElementById('terminales-inicio');
    if (!bloque || !cont) return;

    const terminales = [...new Set(arcosHastaCelula().map(a => a.terminal_inicio).filter(Boolean))].sort();

    if (terminales.length === 0) {
        bloque.classList.add('oculto');
        return;
    }
    bloque.classList.remove('oculto');

    cont.innerHTML = terminales.map(t => `
        <button class="celula-pill pill-secundaria ${t === TERMINAL_INICIO_ACTIVO ? 'activa' : ''}" data-terminal="${escapar(t)}">
            ${escapar(t)}
        </button>
    `).join('');

    cont.querySelectorAll('.celula-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            TERMINAL_INICIO_ACTIVO = (btn.dataset.terminal === TERMINAL_INICIO_ACTIVO) ? '' : btn.dataset.terminal;
            TERMINAL_FIN_ACTIVO = '';
            renderTerminalInicioPills();
            renderTerminalFinPills();
            filtrar();
        });
    });
}

// Nivel 3: terminal de fin — SOLO aparece si con célula+inicio todavía hay más de un destino posible
function renderTerminalFinPills() {
    const bloque = document.getElementById('bloque-terminal-fin');
    const cont = document.getElementById('terminales-fin');
    if (!bloque || !cont) return;

    if (!TERMINAL_INICIO_ACTIVO) {
        bloque.classList.add('oculto');
        return;
    }

    const terminales = [...new Set(arcosHastaTerminalInicio().map(a => a.terminal_fin).filter(Boolean))].sort();

    if (terminales.length <= 1) {
        bloque.classList.add('oculto');
        return; // 0 o 1 destino: no hace falta preguntar, se muestra directo en la lista
    }
    bloque.classList.remove('oculto');

    cont.innerHTML = terminales.map(t => `
        <button class="celula-pill pill-secundaria ${t === TERMINAL_FIN_ACTIVO ? 'activa' : ''}" data-terminal="${escapar(t)}">
            ${escapar(t)}
        </button>
    `).join('');

    cont.querySelectorAll('.celula-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            TERMINAL_FIN_ACTIVO = (btn.dataset.terminal === TERMINAL_FIN_ACTIVO) ? '' : btn.dataset.terminal;
            renderTerminalFinPills();
            filtrar();
        });
    });
}

// -----------------------------------------------------------------------------
// EVENTOS
// -----------------------------------------------------------------------------

function bindEventos() {
    document.getElementById('busqueda').addEventListener('input', filtrar);
    document.getElementById('limpiar').addEventListener('click', limpiarFiltros);
    document.getElementById('btn-volver').addEventListener('click', volverALista);

    document.getElementById('toggle-busqueda').addEventListener('click', () => {
        document.getElementById('bloque-busqueda').classList.toggle('oculto');
        const abierto = !document.getElementById('bloque-busqueda').classList.contains('oculto');
        if (abierto) document.getElementById('busqueda').focus();
    });
}

// -----------------------------------------------------------------------------
// FILTRADO
// -----------------------------------------------------------------------------

function filtrar() {
    const q = document.getElementById('busqueda').value.toLowerCase().trim();

    const filtrados = ARCOS.filter(a => {
        if (CELULA_ACTIVA && a.celula !== CELULA_ACTIVA) return false;
        if (TERMINAL_INICIO_ACTIVO && a.terminal_inicio !== TERMINAL_INICIO_ACTIVO) return false;
        if (TERMINAL_FIN_ACTIVO && a.terminal_fin !== TERMINAL_FIN_ACTIVO) return false;
        if (q) {
            const hay = [
                a.terminal_inicio,
                a.terminal_fin,
                a.celula,
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
    document.getElementById('bloque-busqueda').classList.add('oculto');
    CELULA_ACTIVA = '';
    TERMINAL_INICIO_ACTIVO = '';
    TERMINAL_FIN_ACTIVO = '';
    renderCelulaPills();
    renderTerminalInicioPills();
    renderTerminalFinPills();
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
            ${a.celula ? `<span class="arco-servicio">${escapar(a.celula)}</span>` : ''}
        </li>
    `).join('');

    ul.querySelectorAll('.arco-card').forEach(card => {
        card.addEventListener('click', () => {
            const arco = ARCOS.find(a => a.id === card.dataset.id);
            if (arco) mostrarDetalle(arco);
        });
    });
}

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

    const subt = [arco.sentido, arco.celula].filter(Boolean).join(' · ');
    document.getElementById('detalle-subtitulo').textContent = subt || '—';

    // Ficha técnica (distancia / duración planificada) — solo si vienen en el JSON
    const ficha = document.getElementById('ficha');
    if (ficha) {
        const items = [];
        if (arco.distancia_km != null && arco.distancia_km !== '')
            items.push(`<span class="ficha-item"><b>${escapar(String(arco.distancia_km))}</b> km</span>`);
        if (arco.duracion_min != null && arco.duracion_min !== '')
            items.push(`<span class="ficha-item"><b>${escapar(String(arco.duracion_min))}</b> min plan</span>`);
        if (items.length) {
            ficha.innerHTML = items.join('');
            ficha.classList.remove('oculto');
        } else {
            ficha.classList.add('oculto');
        }
    }

    // Lista de calles
    const ol = document.getElementById('lista-calles');
    ol.innerHTML = arco.calles.map(c => `<li>${escapar(c)}</li>`).join('');

    // Notas
    const notas = document.getElementById('notas');
    if (arco.notas) {
        notas.textContent = arco.notas;
        notas.classList.remove('oculto');
    } else {
        notas.classList.add('oculto');
    }

    // Mapa + botones
    renderMapa(arco);
    setupBotones(arco);

    window.scrollTo({ top: 0, behavior: 'instant' });
}

// -----------------------------------------------------------------------------
// MAPA (Leaflet)
// -----------------------------------------------------------------------------

function renderMapa(arco) {
    const mapaDiv  = document.getElementById('mapa');
    const vacioDiv = document.getElementById('mapa-vacio');

    // Destruir el mapa anterior si existía
    if (MAPA) {
        MAPA.remove();
        MAPA = null;
        CAPA_RUTA = null;
    }

    // Si no tiene coordenadas, mostrar el placeholder vacío y salir
    if (!arco.tiene_mapa) {
        mapaDiv.classList.add('oculto');
        vacioDiv.classList.remove('oculto');
        return;
    }

    mapaDiv.classList.remove('oculto');
    vacioDiv.classList.add('oculto');

    // GeoJSON viene como [lng, lat], Leaflet quiere [lat, lng]
    const coords = arco.coordenadas.map(([lng, lat]) => [lat, lng]);

    MAPA = L.map('mapa', {
        zoomControl: true,
        attributionControl: false
    });

    // Tiles oscuros para combinar con el dark mode (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(MAPA);

    // Polyline naranja con la ruta
    CAPA_RUTA = L.polyline(coords, {
        color: '#FF6B1A',
        weight: 5,
        opacity: 0.95,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(MAPA);

    // Marcador de inicio (verde Waze)
    L.circleMarker(coords[0], {
        radius: 8,
        color: '#33CCCC',
        fillColor: '#33CCCC',
        fillOpacity: 1,
        weight: 2
    }).addTo(MAPA).bindPopup('<b>Inicio:</b> ' + escapar(arco.terminal_inicio));

    // Marcador de fin (naranja)
    L.circleMarker(coords[coords.length - 1], {
        radius: 8,
        color: '#FFFFFF',
        fillColor: '#FF6B1A',
        fillOpacity: 1,
        weight: 2
    }).addTo(MAPA).bindPopup('<b>Fin:</b> ' + escapar(arco.terminal_fin));

    // Ajustar el mapa para que se vea toda la ruta
    MAPA.fitBounds(L.latLngBounds(coords).pad(0.05));

    // Importante: Leaflet a veces no calcula bien el tamaño cuando el contenedor
    // estaba oculto. Forzar recálculo tras un tick.
    setTimeout(() => MAPA && MAPA.invalidateSize(), 100);
}

// -----------------------------------------------------------------------------
// DEEP LINKS A WAZE / GOOGLE MAPS
// -----------------------------------------------------------------------------

function setupBotones(arco) {
    const btnWaze = document.getElementById('btn-waze');
    const btnMaps = document.getElementById('btn-maps');

    if (!arco.tiene_mapa) {
        btnWaze.classList.add('deshabilitado');
        btnMaps.classList.add('deshabilitado');
        btnWaze.removeAttribute('href');
        btnMaps.removeAttribute('href');
        return;
    }

    btnWaze.classList.remove('deshabilitado');
    btnMaps.classList.remove('deshabilitado');

    const coords = arco.coordenadas; // [lng, lat]
    const inicio = coords[0];
    const fin    = coords[coords.length - 1];

    // WAZE: solo navega al destino final
    btnWaze.href = `https://waze.com/ul?ll=${fin[1]},${fin[0]}&navigate=yes`;

    // GOOGLE MAPS: ruta completa con waypoints intermedios (max 8 para no pasarse del límite)
    const intermedios = sampleWaypoints(coords.slice(1, -1), 8);
    const wpStr = intermedios.map(c => `${c[1]},${c[0]}`).join('|');

    let mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${inicio[1]},${inicio[0]}&destination=${fin[1]},${fin[0]}`;
    if (wpStr) mapsUrl += `&waypoints=${encodeURIComponent(wpStr)}`;

    btnMaps.href = mapsUrl;
}

function sampleWaypoints(coords, maxPoints) {
    if (coords.length <= maxPoints) return coords;
    const step = coords.length / maxPoints;
    const sampled = [];
    for (let i = 0; i < maxPoints; i++) {
        sampled.push(coords[Math.floor(i * step)]);
    }
    return sampled;
}

// -----------------------------------------------------------------------------
// VOLVER A LA LISTA
// -----------------------------------------------------------------------------

function volverALista() {
    document.getElementById('vista-detalle').classList.add('oculta');
    document.getElementById('vista-lista').classList.remove('oculta');
    if (MAPA) {
        MAPA.remove();
        MAPA = null;
        CAPA_RUTA = null;
    }
}

// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------

init();
