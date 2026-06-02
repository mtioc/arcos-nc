// =============================================================================
// app.js — Arcos NC Hualpén
// Lee rutas_consolidadas.json (formato: { metadata: {...}, geometria: {...} })
// =============================================================================

let ARCOS = [];
let MAPA = null;
let CAPA_RUTA = null;

// -----------------------------------------------------------------------------
// CARGA INICIAL
// -----------------------------------------------------------------------------

async function init() {
    try {
        const res = await fetch('rutas_consolidadas.json?v=' + Date.now());
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
        sentido:         (m.sentido || '').trim() || null,
        calles:          parsearCalles(m.calles),
        notas:           (m.notas || '').trim() || null,
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

    const subt = [arco.sentido, arco.servicio].filter(Boolean).join(' · ');
    document.getElementById('detalle-subtitulo').textContent = subt || '—';

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
