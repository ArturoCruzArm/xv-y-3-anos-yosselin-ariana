// ========================================
// SUPABASE CONFIG
// ========================================
const SUPABASE_URL  = 'https://nzpujmlienzfetqcgsxz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cHVqbWxpZW56ZmV0cWNnc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYzMzYsImV4cCI6MjA5MDI2MjMzNn0.xl3lsb-KYj5tVLKTnzpbsdEGoV9ySnswH4eyRuyEH1s';
const EVENTO_SLUG   = 'xv-y-3-anos-yosselin-ariana';
const SB_HEADERS    = { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };

function getSessionId() {
    const KEY = 'foro7_sid';
    let sid = localStorage.getItem(KEY);
    if (!sid) { sid = crypto.randomUUID(); localStorage.setItem(KEY, sid); }
    return sid;
}
const SESSION_ID = getSessionId();
let eventoIdCache = null;
let sbDisponible  = true;

async function sbGetEventoId() {
    if (eventoIdCache) return eventoIdCache;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/eventos?slug=eq.${EVENTO_SLUG}&select=id&limit=1`, { headers: SB_HEADERS });
    const [ev] = await r.json();
    eventoIdCache = ev?.id || null;
    return eventoIdCache;
}

async function sbRegistrarVisita(pagina = 'selector') {
    try {
        const evento_id = await sbGetEventoId();
        if (!evento_id) return;
        await fetch(`${SUPABASE_URL}/rest/v1/visitas`, {
            method: 'POST',
            headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ evento_id, pagina, session_id: SESSION_ID })
        });
    } catch(e) {}
}

// ========================================
// GLOBAL VARIABLES - XV Años Yosselin & 3 Años Ariana
// ========================================
// Lista de fotos — se genera cuando se suban las imágenes
// Total: 0 fotos
const photos = [
    // Agregar fotos aquí cuando se suban las imágenes del evento
    // "imagenes/DSC_0001.webp","imagenes/DSC_2778.webp","imagenes/DSC_2779.webp","imagenes/DSC_2780.webp",
];

// ── Configuración del evento ──
const CONFIG = {
    slug:               'xv-y-3-anos-yosselin-ariana',
    nombre:             (window.EVENT_CONFIG && window.EVENT_CONFIG.nombre)             || 'Yosselin & Ariana',
    telefono:           (window.EVENT_CONFIG && window.EVENT_CONFIG.telefono)           || '',
    fechaEvento:        (window.EVENT_CONFIG && window.EVENT_CONFIG.fechaEvento)        || new Date(2027, 0, 9, 17, 0, 0),
    limiteImpresion:    100,
    limiteInvitacion:   null,
    costoFotoAdicional: (window.EVENT_CONFIG && window.EVENT_CONFIG.costoFotoAdicional) || 15,
};

const STORAGE_KEY = 'xv_3_anos_yosselin_ariana_photo_selections';
const KEY_FILTER   = 'xv_filter';
const KEY_SCROLL   = 'xv_scroll';
const KEY_LAST     = 'xv_last_photo';
const LIMITES = {
    impresion: CONFIG.limiteImpresion,
    invitacion: CONFIG.limiteInvitacion
};
const COSTO_FOTO_ADICIONAL = CONFIG.costoFotoAdicional;

let photoSelections = {};
let currentPhotoIndex = null;
let currentFilter = 'all';
let touchStartX = 0;
let touchStartY = 0;
let scrollPositionBeforeModal = 0;
let scrollSaveTimer = null;
let modalOpen = false;

// ========================================
// LOCAL STORAGE FUNCTIONS
// ========================================
function mostrarBannerSinSeleccion() {
    if (document.getElementById('banner-sin-sel')) return;
    if (Object.keys(photoSelections).length > 0) return;
    if (CONFIG.fechaEvento > new Date()) return;
    const banner = document.createElement('div');
    banner.id = 'banner-sin-sel';
    banner.style.cssText = 'background:#78350f;color:#fcd34d;text-align:center;padding:12px 20px;font-size:.88rem;position:sticky;top:0;z-index:200;line-height:1.5;';
    banner.innerHTML = '📸 <strong>¡Tus fotos están listas!</strong> Aún no has seleccionado ninguna foto. ¡Empieza ahora! <button onclick="this.parentElement.remove()" style="margin-left:12px;background:transparent;border:1px solid #fcd34d;color:#fcd34d;padding:1px 8px;border-radius:4px;cursor:pointer;font-size:.85rem;">×</button>';
    document.body.insertBefore(banner, document.body.firstChild);
}

async function loadSelections(isPoll = false) {
    if (!isPoll) {
        // Carga inicial: mostrar localStorage de inmediato (cero latencia)
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) photoSelections = JSON.parse(saved);
        } catch(e) { photoSelections = {}; }
    }

    if (!sbDisponible) return;
    try {
        const evento_id = await sbGetEventoId();
        if (!evento_id) { sbDisponible = false; return; }

        const r = await fetch(
            `${SUPABASE_URL}/rest/v1/selecciones?evento_id=eq.${evento_id}&select=foto_index,impresion,invitacion,descartada`,
            { headers: SB_HEADERS }
        );
        if (!r.ok) throw new Error(r.status);
        const rows = await r.json();

        const sb = {};
        rows.forEach(row => {
            if (row.impresion || row.invitacion || row.descartada)
                sb[row.foto_index] = { impresion: row.impresion, invitacion: row.invitacion, descartada: row.descartada };
        });

        if (!isPoll) {
            // Carga inicial: merge y migrar localStorage a Supabase para que otros lo vean
            const merged = {...sb};
            Object.entries(photoSelections).forEach(([idx, sel]) => {
                if (sel.impresion || sel.invitacion || sel.descartada) merged[idx] = sel;
            });
            photoSelections = merged;
            if (Object.keys(photoSelections).length > 0) {
                sbSyncSelections().catch(e => console.warn('[Supabase] Migración:', e.message));
            }
            sbRegistrarVisita('selector');
            mostrarBannerSinSeleccion();
        } else {
            // Polling: Supabase es la verdad compartida, reemplaza estado local
            photoSelections = sb;
        }

        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(photoSelections)); } catch(e) {}
        renderGallery(); setupLazyLoad(); updateStats(); updateFilterButtons();
    } catch(e) {
        console.warn('[Supabase] Usando localStorage:', e.message);
        sbDisponible = false;
    }
}

async function saveSelections() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(photoSelections));
    } catch(e) {
        showToast('Error al guardar. Verifica el espacio del navegador.', 'error');
    }
    if (!sbDisponible) return;
    sbSyncSelections().catch(e => console.warn('[Supabase] Sync error:', e.message));
}

async function sbSyncSelections() {
    const snapshot = {...photoSelections}; // snapshot BEFORE any await
    const evento_id = await sbGetEventoId();
    if (!evento_id) return;
    const rows = Object.entries(snapshot).map(([idx, sel]) => ({
        evento_id, session_id: SESSION_ID, foto_index: parseInt(idx),
        impresion: sel.impresion || false, invitacion: sel.invitacion || false, descartada: sel.descartada || false,
    }));
    if (rows.length === 0) return;
    await fetch(`${SUPABASE_URL}/rest/v1/selecciones?on_conflict=evento_id,foto_index`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
    });
}

function swipeSaveAndNext() {
    if (currentPhotoIndex === null) return;
    const selectedCategories = {};
    let hasAnySelection = false;
    document.querySelectorAll('.option-btn').forEach(btn => {
        selectedCategories[btn.dataset.category] = btn.classList.contains('selected');
        if (btn.classList.contains('selected')) hasAnySelection = true;
    });
    if (hasAnySelection) {
        photoSelections[currentPhotoIndex] = selectedCategories;
    } else {
        const idx = currentPhotoIndex;
        delete photoSelections[idx];
        if (sbDisponible) sbDeleteSelection(idx).catch(e => console.warn('[Supabase] Delete:', e.message));
    }
    saveSelections();
    updateCard(currentPhotoIndex);
    updateStats();
    updateFilterButtons();
    navigatePhoto('next');
    showToast('Guardado ✓', 'success');
}

function swipeClearAndNext() {
    if (currentPhotoIndex === null) return;
    const idx = currentPhotoIndex;
    if (photoSelections[idx]) {
        delete photoSelections[idx];
        if (sbDisponible) sbDeleteSelection(idx).catch(e => console.warn('[Supabase] Delete:', e.message));
        saveSelections();
        updateCard(idx);
        updateStats();
        updateFilterButtons();
    }
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    navigatePhoto('next');
    showToast('Selección quitada', 'success');
}

async function sbDeleteSelection(foto_index) {
    const evento_id = await sbGetEventoId();
    if (!evento_id) return;
    await fetch(
        `${SUPABASE_URL}/rest/v1/selecciones?evento_id=eq.${evento_id}&foto_index=eq.${foto_index}`,
        { method: 'DELETE', headers: SB_HEADERS }
    );
}

async function clearAllSelections() {
    if (confirm('¿Estás seguro de que quieres borrar TODAS las selecciones? Esta acción no se puede deshacer.')) {
        // Borrar de Supabase primero
        if (sbDisponible) {
            try {
                const evento_id = await sbGetEventoId();
                if (evento_id) {
                    await fetch(
                        `${SUPABASE_URL}/rest/v1/selecciones?evento_id=eq.${evento_id}`,
                        { method: 'DELETE', headers: SB_HEADERS }
                    );
                }
            } catch(e) { console.warn('[Supabase] Error al borrar:', e.message); }
        }
        photoSelections = {};
        try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
        renderGallery();
        setupLazyLoad();
        updateStats();
        updateFilterButtons();
        showToast('Todas las selecciones han sido eliminadas', 'success');
    }
}

// ========================================
// STATS FUNCTIONS
// ========================================
function getStats() {
    const stats = {
        impresion: 0,
        invitacion: 0,
        descartada: 0,
        sinClasificar: photos.length
    };

    Object.values(photoSelections).forEach(selection => {
        if (selection.impresion) stats.impresion++;
        if (selection.invitacion) stats.invitacion++;
        if (selection.descartada) stats.descartada++;
    });

    stats.sinClasificar = photos.length - Object.keys(photoSelections).length;

    return stats;
}

function updateStats() {
    const stats = getStats();

    document.getElementById('countImpresion').textContent =
        LIMITES.impresion ? `${stats.impresion}/${LIMITES.impresion}` : stats.impresion;
    document.getElementById('countInvitacion').textContent = stats.invitacion;
    document.getElementById('countDescartada').textContent = stats.descartada;
    document.getElementById('countSinClasificar').textContent = stats.sinClasificar;

    const fotosAdicionales = Math.max(0, stats.impresion - LIMITES.impresion);
    const costoExtra = fotosAdicionales * COSTO_FOTO_ADICIONAL;

    const extraCostDisplay = document.getElementById('extraCostDisplay');
    if (extraCostDisplay) {
        if (fotosAdicionales > 0) {
            extraCostDisplay.style.display = 'block';
            document.getElementById('extraCostAmount').textContent = `$${costoExtra} MXN`;
            document.getElementById('extraCostDetail').textContent = `${fotosAdicionales} foto${fotosAdicionales > 1 ? 's' : ''} adicional${fotosAdicionales > 1 ? 'es' : ''} x $${COSTO_FOTO_ADICIONAL}`;
        } else {
            extraCostDisplay.style.display = 'none';
        }
    }

    const impresionCard = document.querySelector('.stat-card.impresion');

    if (impresionCard) {
        if (stats.impresion > LIMITES.impresion) {
            impresionCard.style.borderColor = '#ff9800';
            impresionCard.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
        } else if (stats.impresion === LIMITES.impresion) {
            impresionCard.style.borderColor = '#4caf50';
            impresionCard.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
        } else {
            impresionCard.style.borderColor = '';
            impresionCard.style.backgroundColor = '';
        }
    }
}

// ========================================
// GALLERY FUNCTIONS
// ========================================
function renderGallery() {
    const grid = document.getElementById('photosGrid');
    if (!grid) return;

    grid.innerHTML = '';

    if (photos.length === 0) {
        grid.innerHTML = '<div class="no-photos-message">Las fotos estarán disponibles después del evento (9 de enero de 2027)</div>';
        return;
    }

    photos.forEach((photo, index) => {
        const selection = photoSelections[index] || {};
        const hasAny = selection.impresion || selection.invitacion || selection.descartada;

        const card = document.createElement('div');
        card.className = 'photo-card';
        card.dataset.index = index;

        if (selection.descartada) {
            card.classList.add('has-descartada');
        } else {
            const categories = [];
            if (selection.impresion) categories.push('impresion');
            if (selection.invitacion) categories.push('invitacion');

            if (categories.length > 1) {
                card.classList.add('has-multiple');
            } else if (categories.length === 1) {
                card.classList.add(`has-${categories[0]}`);
            }
        }

        let badgesHTML = '';
        if (hasAny) {
            badgesHTML = '<div class="photo-badges">';
            if (selection.impresion) badgesHTML += '<span class="badge badge-impresion">📸 Impresión</span>';
            if (selection.invitacion) badgesHTML += '<span class="badge badge-invitacion">💌 Invitación</span>';
            if (selection.descartada) badgesHTML += '<span class="badge badge-descartada">❌ Descartada</span>';
            badgesHTML += '</div>';
        }

        const displayNumber = `Foto ${index + 1}`;
        const mediaHTML = `
            <div class="photo-image-container">
                <img data-src="${photo}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'/%3E" alt="${displayNumber}" class="lazy-img">
            </div>
        `;

        card.innerHTML = `
            ${mediaHTML}
            <div class="photo-number">${displayNumber}</div>
            ${badgesHTML}
        `;

        card.addEventListener('click', () => openModal(index));
        grid.appendChild(card);
    });

    applyFilter();
}

// ========================================
// LAZY LOADER CON COLA (máx 4 concurrentes — evita throttle de GitHub en iOS)
// ========================================
let lazyObserver = null;
let lazyQueue = [];
let lazyActive = 0;
const LAZY_MAX = 4;

function lazyLoadNext() {
    while (lazyActive < LAZY_MAX && lazyQueue.length > 0) {
        const img = lazyQueue.shift();
        if (!img.dataset.src || img.classList.contains('lazy-loaded')) continue;
        lazyActive++;
        img.onload = img.onerror = () => { lazyActive--; lazyLoadNext(); };
        img.src = img.dataset.src;
        img.classList.add('lazy-loaded');
    }
}

function setupLazyLoad() {
    if (lazyObserver) lazyObserver.disconnect();
    lazyQueue = [];
    lazyActive = 0;

    lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                lazyObserver.unobserve(img);
                if (!img.classList.contains('lazy-loaded')) {
                    lazyQueue.push(img);
                    lazyLoadNext();
                }
            }
        });
    }, { rootMargin: '300px 0px' });

    document.querySelectorAll('img.lazy-img:not(.lazy-loaded)').forEach(img => {
        lazyObserver.observe(img);
    });
}

// ========================================
// FILTER FUNCTIONS
// ========================================
function applyFilter() {
    const cards = document.querySelectorAll('.photo-card');

    cards.forEach(card => {
        const index = parseInt(card.dataset.index);
        const selection = photoSelections[index] || {};
        let show = false;

        switch (currentFilter) {
            case 'all':
                show = true;
                break;
            case 'impresion':
                show = selection.impresion === true;
                break;
            case 'invitacion':
                show = selection.invitacion === true;
                break;
            case 'descartada':
                show = selection.descartada === true;
                break;
            case 'sin-clasificar':
                show = !selection.impresion && !selection.invitacion && !selection.descartada;
                break;
        }

        card.classList.toggle('hidden', !show);
    });
}

function setFilter(filter) {
    currentFilter = filter;
    applyFilter();

    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
    });

    const activeBtn = document.querySelector(`[data-filter="${filter}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    try { localStorage.setItem(KEY_FILTER, filter); } catch (e) {}
}

function updateFilterButtons() {
    const stats = getStats();

    const btnAll = document.getElementById('btnFilterAll');
    const btnImpresion = document.getElementById('btnFilterImpresion');
    const btnInvitacion = document.getElementById('btnFilterInvitacion');
    const btnDescartada = document.getElementById('btnFilterDescartada');
    const btnSinClasificar = document.getElementById('btnFilterSinClasificar');

    if (btnAll) btnAll.textContent = `Todas (${photos.length})`;
    if (btnImpresion) btnImpresion.textContent = `Impresión (${stats.impresion})`;
    if (btnInvitacion) btnInvitacion.textContent = `Invitación (${stats.invitacion})`;
    if (btnDescartada) btnDescartada.textContent = `Descartadas (${stats.descartada})`;
    if (btnSinClasificar) btnSinClasificar.textContent = `Sin Clasificar (${stats.sinClasificar})`;
}

// ========================================
// MODAL FUNCTIONS
// ========================================
function openModal(index) {
    currentPhotoIndex = index;
    try { localStorage.setItem(KEY_LAST, index); } catch (e) {}
    const modal = document.getElementById('photoModal');
    const modalImageContainer = document.querySelector('.modal-image-container');
    const modalPhotoNumber = document.getElementById('modalPhotoNumber');

    const photo = photos[index];
    const displayNumber = `Foto ${index + 1}`;

    modalPhotoNumber.textContent = displayNumber;

    document.getElementById('modalImage').src = photo;
    document.getElementById('modalImage').alt = displayNumber;

    const selection = photoSelections[index] || {};

    document.querySelectorAll('.option-btn').forEach(btn => {
        const category = btn.dataset.category;
        btn.classList.toggle('selected', selection[category] === true);
    });

    modal.classList.add('active');
    updateNavigationButtons();

    modalOpen = true;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('photoModal');
    modal.classList.remove('active');

    document.body.style.overflow = '';
    modalOpen = false;

    currentPhotoIndex = null;
}

// ========================================
// NAVIGATION FUNCTIONS
// ========================================
function navigatePhoto(direction) {
    if (currentPhotoIndex === null) return;

    let newIndex;
    if (direction === "next") {
        newIndex = currentPhotoIndex + 1;
        if (newIndex >= photos.length) {
            newIndex = 0;
        }
    } else if (direction === "prev") {
        newIndex = currentPhotoIndex - 1;
        if (newIndex < 0) {
            newIndex = photos.length - 1;
        }
    }

    saveCurrentSelections();
    openModal(newIndex);
}

function saveCurrentSelections() {
    if (currentPhotoIndex === null) return;

    const selectedCategories = {};
    let hasAnySelection = false;

    document.querySelectorAll(".option-btn").forEach(btn => {
        const category = btn.dataset.category;
        const isSelected = btn.classList.contains("selected");
        selectedCategories[category] = isSelected;
        if (isSelected) hasAnySelection = true;
    });

    if (hasAnySelection) {
        photoSelections[currentPhotoIndex] = selectedCategories;
    } else {
        delete photoSelections[currentPhotoIndex];
    }

    saveSelections();
    updateStats();
    updateFilterButtons();
}

function updateNavigationButtons() {
    const btnPrev = document.getElementById("btnPrevPhoto");
    const btnNext = document.getElementById("btnNextPhoto");

    if (btnPrev && btnNext) {
        btnPrev.disabled = false;
        btnNext.disabled = false;
    }
}

function updateCard(index) {
    const card = document.querySelector(`.photo-card[data-index="${index}"]`);
    if (!card) return;

    const selection = photoSelections[index] || {};
    const hasAny = selection.impresion || selection.invitacion || selection.descartada;

    // Recalcular clases de color
    card.className = 'photo-card';
    if (selection.descartada) {
        card.classList.add('has-descartada');
    } else {
        const cats = [];
        if (selection.impresion) cats.push('impresion');
        if (selection.invitacion) cats.push('invitacion');
        if (cats.length > 1) card.classList.add('has-multiple');
        else if (cats.length === 1) card.classList.add(`has-${cats[0]}`);
    }

    // Actualizar badges sin tocar el <img>
    const existing = card.querySelector('.photo-badges');
    if (existing) existing.remove();
    if (hasAny) {
        const badges = document.createElement('div');
        badges.className = 'photo-badges';
        if (selection.impresion) badges.innerHTML += '<span class="badge badge-impresion">📸 Impresión</span>';
        if (selection.invitacion) badges.innerHTML += '<span class="badge badge-invitacion">💌 Invitación</span>';
        if (selection.descartada) badges.innerHTML += '<span class="badge badge-descartada">❌ Descartada</span>';
        card.appendChild(badges);
    }

    // Aplicar filtro actual
    let show = false;
    switch (currentFilter) {
        case 'all': show = true; break;
        case 'impresion': show = selection.impresion === true; break;
        case 'invitacion': show = selection.invitacion === true; break;
        case 'descartada': show = selection.descartada === true; break;
        case 'sin-clasificar': show = !selection.impresion && !selection.invitacion && !selection.descartada; break;
    }
    card.classList.toggle('hidden', !show);
}

function saveModalSelection() {
    if (currentPhotoIndex === null) return;

    const selectedCategories = {};
    let hasAnySelection = false;

    document.querySelectorAll('.option-btn').forEach(btn => {
        const category = btn.dataset.category;
        const isSelected = btn.classList.contains('selected');
        selectedCategories[category] = isSelected;
        if (isSelected) hasAnySelection = true;
    });

    if (hasAnySelection) {
        photoSelections[currentPhotoIndex] = selectedCategories;
    } else {
        delete photoSelections[currentPhotoIndex];
        if (sbDisponible) sbDeleteSelection(currentPhotoIndex).catch(e => console.warn('[Supabase] Delete:', e.message));
    }

    saveSelections();
    updateCard(currentPhotoIndex);   // solo actualiza esa tarjeta, sin recargar imágenes
    updateStats();
    updateFilterButtons();
    closeModal();
    showToast('Selección guardada correctamente', 'success');
}

// ========================================
// EXPORT FUNCTIONS
// ========================================
function exportToJSON() {
    const stats = getStats();
    const fotosAdicionales = Math.max(0, stats.impresion - LIMITES.impresion);
    const costoExtra = fotosAdicionales * COSTO_FOTO_ADICIONAL;

    const exportData = {
        evento: 'XV Años Yosselin & 3 Años Ariana',
        fecha_exportacion: new Date().toISOString(),
        total_fotos: photos.length,
        estadisticas: stats,
        fotos_incluidas: LIMITES.impresion,
        fotos_adicionales: fotosAdicionales,
        costo_adicional: costoExtra,
        selecciones: []
    };

    photos.forEach((photo, index) => {
        const selection = photoSelections[index];
        if (selection && (selection.impresion || selection.invitacion || selection.descartada)) {
            exportData.selecciones.push({
                numero_foto: index + 1,
                archivo: photo,
                impresion: selection.impresion || false,
                invitacion: selection.invitacion || false,
                descartada: selection.descartada || false
            });
        }
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seleccion-fotos-yosselin-ariana-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Reporte descargado correctamente', 'success');
}

function generateTextSummary() {
    const stats = getStats();
    const fotosAdicionales = Math.max(0, stats.impresion - LIMITES.impresion);
    const costoExtra = fotosAdicionales * COSTO_FOTO_ADICIONAL;

    let summary = '🎉 SELECCIÓN DE FOTOS - XV AÑOS YOSSELIN & 3 AÑOS ARIANA\n';
    summary += '═══════════════════════════════════════════════════\n\n';
    summary += `📋 SEGÚN CONTRATO:\n`;
    summary += `   📸 Impresión incluida: ${LIMITES.impresion} fotos\n\n`;
    summary += `📊 RESUMEN ACTUAL:\n`;
    summary += `   Total de fotos disponibles: ${photos.length}\n`;
    summary += `   📸 Para impresión: ${stats.impresion}/${LIMITES.impresion} ${stats.impresion === LIMITES.impresion ? '✓' : stats.impresion > LIMITES.impresion ? '⚠️ ADICIONALES' : '⚠️ FALTA'}\n`;
    summary += `   💌 Para invitación: ${stats.invitacion}\n`;
    summary += `   ❌ Descartadas: ${stats.descartada}\n`;
    summary += `   ⭕ Sin clasificar: ${stats.sinClasificar}\n\n`;

    if (fotosAdicionales > 0) {
        summary += `💰 COSTO ADICIONAL:\n`;
        summary += `   Fotos adicionales: ${fotosAdicionales}\n`;
        summary += `   Costo por foto: $${COSTO_FOTO_ADICIONAL} MXN\n`;
        summary += `   TOTAL ADICIONAL: $${costoExtra} MXN\n\n`;
    }

    summary += `\n📅 Generado el: ${new Date().toLocaleString('es-MX')}\n`;

    return summary;
}

function copyToClipboard() {
    const summary = generateTextSummary();

    navigator.clipboard.writeText(summary).then(() => {
        showToast('Resumen copiado al portapapeles', 'success');
    }).catch(() => {
        showToast('No se pudo copiar. Selecciona el texto manualmente.', 'error');
    });
}

// ========================================
// TOAST NOTIFICATION
// ========================================
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ========================================
// EVENT LISTENERS
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    renderGallery();
    setupLazyLoad();
    updateStats();
    updateFilterButtons();
    loadSelections();

    // Restaurar filtro y scroll de la sesión anterior
    const savedFilter = localStorage.getItem(KEY_FILTER);
    if (savedFilter) setFilter(savedFilter);
    const savedScroll = parseInt(localStorage.getItem(KEY_SCROLL) || '0');
    if (savedScroll > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, savedScroll)));
    }

    // Filter buttons
    const btnFilterAll = document.getElementById('btnFilterAll');
    const btnFilterImpresion = document.getElementById('btnFilterImpresion');
    const btnFilterInvitacion = document.getElementById('btnFilterInvitacion');
    const btnFilterDescartada = document.getElementById('btnFilterDescartada');
    const btnFilterSinClasificar = document.getElementById('btnFilterSinClasificar');

    if (btnFilterAll) btnFilterAll.addEventListener('click', () => setFilter('all'));
    if (btnFilterImpresion) btnFilterImpresion.addEventListener('click', () => setFilter('impresion'));
    if (btnFilterInvitacion) btnFilterInvitacion.addEventListener('click', () => setFilter('invitacion'));
    if (btnFilterDescartada) btnFilterDescartada.addEventListener('click', () => setFilter('descartada'));
    if (btnFilterSinClasificar) btnFilterSinClasificar.addEventListener('click', () => setFilter('sin-clasificar'));

    // Action buttons
    const btnExport = document.getElementById('btnExport');
    const btnShare = document.getElementById('btnShare');
    const btnClear = document.getElementById('btnClear');

    if (btnExport) btnExport.addEventListener('click', exportToJSON);
    if (btnShare) btnShare.addEventListener('click', copyToClipboard);
    if (btnClear) btnClear.addEventListener('click', clearAllSelections);

    // Modal controls
    const modalClose = document.querySelector('.modal-close');
    const btnCancelSelection = document.getElementById('btnCancelSelection');
    const btnSaveSelection = document.getElementById('btnSaveSelection');

    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (btnCancelSelection) btnCancelSelection.addEventListener('click', closeModal);
    if (btnSaveSelection) btnSaveSelection.addEventListener('click', saveModalSelection);

    // Option buttons
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
        });
    });

    // Close modal on outside click + swipe táctil para Android
    const photoModal = document.getElementById('photoModal');
    if (photoModal) {
        photoModal.addEventListener('click', (e) => {
            if (e.target.id === 'photoModal') {
                closeModal();
            }
        });

        // Swipe: derecha = guardar selección + siguiente, izquierda = quitar + siguiente
        photoModal.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        photoModal.addEventListener('touchend', (e) => {
            const deltaX = e.changedTouches[0].clientX - touchStartX;
            const deltaY = e.changedTouches[0].clientY - touchStartY;
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
                if (deltaX > 0) swipeSaveAndNext();
                else swipeClearAndNext();
            }
        }, { passive: true });
    }

    // Navigation buttons
    const btnPrevPhoto = document.getElementById('btnPrevPhoto');
    const btnNextPhoto = document.getElementById('btnNextPhoto');

    if (btnPrevPhoto) btnPrevPhoto.addEventListener('click', () => navigatePhoto('prev'));
    if (btnNextPhoto) btnNextPhoto.addEventListener('click', () => navigatePhoto('next'));

    // Polling: sincronizar con otros usuarios cada 30 segundos
    if (sbDisponible) {
        setInterval(() => { if (!modalOpen) loadSelections(true); }, 30000);
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        const modal = document.getElementById('photoModal');
        if (modal && modal.classList.contains('active')) {
            if (e.key === 'Escape') {
                closeModal();
            } else if (e.key === 'Enter') {
                saveModalSelection();
            } else if (e.key === 'ArrowLeft') {
                navigatePhoto('prev');
            } else if (e.key === 'ArrowRight') {
                navigatePhoto('next');
            }
        }
    });

});

// Guardar scroll con debounce
window.addEventListener('scroll', () => {
    if (modalOpen) return;
    clearTimeout(scrollSaveTimer);
    scrollSaveTimer = setTimeout(() => {
        try { localStorage.setItem(KEY_SCROLL, window.scrollY); } catch (e) {}
    }, 300);
}, { passive: true });

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        saveSelections();
        try { localStorage.setItem(KEY_SCROLL, window.scrollY); } catch (e) {}
    }
});

window.addEventListener('beforeunload', () => {
    saveSelections();
    try { localStorage.setItem(KEY_SCROLL, window.scrollY); } catch (e) {}
});

// Registrar Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ========================================
// DOWNLOAD FUNCTIONS
// ========================================
function downloadCurrentPhoto() {
    if (currentPhotoIndex === null) return;
    var url = photos[currentPhotoIndex];
    if (!url) return;
    var filename = 'foto-' + (currentPhotoIndex + 1) + '.jpg';
    showToast('Preparando descarga...', 'success');

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Marca de agua diagonal repetida
        var wmText = 'FORO 7  \u00b7  FOTOGRAF\u00cdA Y VIDEO';
        var fontSize = Math.max(canvas.width, canvas.height) * 0.035;
        ctx.save();
        ctx.font = 'bold ' + fontSize + 'px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = fontSize * 0.06;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 6);
        var textW = ctx.measureText(wmText).width;
        var spacingY = fontSize * 4;
        var spacingX = textW + fontSize * 2;
        var diag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
        for (var y = -diag; y < diag; y += spacingY) {
            for (var x = -diag; x < diag; x += spacingX) {
                ctx.strokeText(wmText, x, y);
                ctx.fillText(wmText, x, y);
            }
        }
        ctx.restore();

        canvas.toBlob(function(blob) {
            var a = document.createElement('a');
            var objUrl = URL.createObjectURL(blob);
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function() { URL.revokeObjectURL(objUrl); }, 3000);
            sbRegistrarVisita('descarga');
            showToast('Descargando ' + filename, 'success');
        }, 'image/jpeg', 0.92);
    };
    img.onerror = function() {
        // Fallback: usar la imagen ya cargada en el modal
        var modalImg = document.getElementById('modalImage');
        if (modalImg && modalImg.naturalWidth > 0) {
            var canvas = document.createElement('canvas');
            canvas.width = modalImg.naturalWidth;
            canvas.height = modalImg.naturalHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(modalImg, 0, 0);
            var wmText = 'FORO 7  \u00b7  FOTOGRAF\u00cdA Y VIDEO';
            var fontSize = Math.max(canvas.width, canvas.height) * 0.035;
            ctx.save();
            ctx.font = 'bold ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.strokeStyle = 'rgba(0,0,0,0.18)';
            ctx.lineWidth = fontSize * 0.06;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 6);
            var textW = ctx.measureText(wmText).width;
            var spacingY = fontSize * 4;
            var spacingX = textW + fontSize * 2;
            var diag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
            for (var y = -diag; y < diag; y += spacingY) {
                for (var x = -diag; x < diag; x += spacingX) {
                    ctx.strokeText(wmText, x, y);
                    ctx.fillText(wmText, x, y);
                }
            }
            ctx.restore();
            canvas.toBlob(function(blob) {
                var a = document.createElement('a');
                var objUrl = URL.createObjectURL(blob);
                a.href = objUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function() { URL.revokeObjectURL(objUrl); }, 3000);
                sbRegistrarVisita('descarga');
                showToast('Descargando ' + filename, 'success');
            }, 'image/jpeg', 0.92);
        } else {
            window.open(url, '_blank');
            showToast('Abriendo foto...', 'success');
        }
    };
    img.src = url;
}

function downloadAndClose() {
    downloadCurrentPhoto();
    closeModal();
}

// Inyectar botones de descarga en el modal al cargar
(function injectDownloadButtons(){
    function tryInject(){
        var actions = document.querySelector('.modal-actions');
        if (!actions) return;
        if (document.getElementById('btnDownloadClose')) return;
        var btnDlClose = document.createElement('button');
        btnDlClose.id = 'btnDownloadClose';
        btnDlClose.className = 'btn';
        btnDlClose.textContent = '\u2B07 Descargar y Cerrar';
        btnDlClose.style.cssText = 'background:#6c5ce7;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;margin-right:4px;';
        btnDlClose.addEventListener('click', downloadAndClose);
        var btnDl = document.createElement('button');
        btnDl.id = 'btnDownloadPhoto';
        btnDl.className = 'btn';
        btnDl.textContent = '\u2B07 JPG';
        btnDl.style.cssText = 'background:#0984e3;color:#fff;border:none;padding:8px 14px;border-radius:6px;cursor:pointer;font-size:.85rem;margin-right:4px;';
        btnDl.addEventListener('click', downloadCurrentPhoto);
        actions.insertBefore(btnDlClose, actions.firstChild);
        actions.insertBefore(btnDl, btnDlClose);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInject);
    else tryInject();
})();
