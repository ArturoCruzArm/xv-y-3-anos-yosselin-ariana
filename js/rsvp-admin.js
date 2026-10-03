// rsvp-admin.js — Dashboard RSVP con acompanantes normalizados
(function () {
    const cfg       = window.RSVP_CONFIG || {};
    const SB_URL    = 'https://nzpujmlienzfetqcgsxz.supabase.co';
    const SB_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cHVqbWxpZW56ZmV0cWNnc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYzMzYsImV4cCI6MjA5MDI2MjMzNn0.xl3lsb-KYj5tVLKTnzpbsdEGoV9ySnswH4eyRuyEH1s';
    const SB_H      = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' };
    const EVENTO_SLUG = cfg.slug || '';
    const BASE_URL    = cfg.baseUrl || window.location.origin;

    let eventoId = null, guests = [], editingId = null, currentFilter = 'all';

    function checkPin() { return true; }

    async function getEventoId() {
        if (eventoId) return eventoId;
        const r = await fetch(`${SB_URL}/rest/v1/eventos?slug=eq.${EVENTO_SLUG}&select=id&limit=1`, { headers: SB_H });
        const rows = await r.json();
        eventoId = rows[0]?.id || null;
        return eventoId;
    }

    // ── Cargar invitados + acompanantes ──────────────────────────────────────
    async function loadGuests() {
        const eid = await getEventoId();
        if (!eid) { showError('No se encontro el evento.'); return; }
        const [gR, aR] = await Promise.all([
            fetch(`${SB_URL}/rest/v1/invitados?evento_id=eq.${eid}&order=fecha_creacion.asc`, { headers: SB_H }),
            fetch(`${SB_URL}/rest/v1/acompanantes?select=*,invitado_id&order=orden.asc`, { headers: SB_H })
        ]);
        guests = await gR.json();
        const acomps = await aR.json();
        cargarProtagonistas(eid);
        // Adjuntar acompanantes a cada invitado
        guests.forEach(g => {
            g._acomps = acomps.filter(a => a.invitado_id === g.id).sort((a,b) => a.orden - b.orden);
        });
        renderAll();
    }

    // ── Guardar invitado + acompanantes ──────────────────────────────────────
    async function saveGuest(data, nombresAcomp) {
        const eid = await getEventoId();
        let guestId;
        if (editingId) {
            await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${editingId}`, {
                method: 'PATCH', headers: { ...SB_H, 'Prefer': 'return=minimal' },
                body: JSON.stringify(data)
            });
            guestId = editingId;
            // Borrar acompanantes viejos y recrear
            await fetch(`${SB_URL}/rest/v1/acompanantes?invitado_id=eq.${guestId}`, {
                method: 'DELETE', headers: SB_H
            });
        } else {
            const r = await fetch(`${SB_URL}/rest/v1/invitados`, {
                method: 'POST', headers: { ...SB_H, 'Prefer': 'return=representation' },
                body: JSON.stringify({ evento_id: eid, ...data })
            });
            const created = await r.json();
            guestId = created[0].id;
        }
        // Insertar acompanantes
        if (nombresAcomp.length) {
            const rows = nombresAcomp.map((n, i) => ({ invitado_id: guestId, nombre: n, orden: i }));
            await fetch(`${SB_URL}/rest/v1/acompanantes`, {
                method: 'POST', headers: { ...SB_H, 'Prefer': 'return=minimal' },
                body: JSON.stringify(rows)
            });
        }
        await loadGuests();
    }

    async function deleteGuest(id) {
        if (!confirm('Eliminar este invitado?')) return;
        await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${id}`, { method: 'DELETE', headers: SB_H });
        guests = guests.filter(g => g.id !== id);
        renderAll();
    }

    async function sendWhatsApp(id) {
        const g = guests.find(x => x.id === id);
        if (!g) return;
        const link = `${BASE_URL}/index.html?inv=${g.token}`;
        const evName = cfg.eventName || 'el evento';
        const evDate = cfg.eventDate ? ` el ${cfg.eventDate}` : '';
        const acompNombres = (g._acomps || []).filter(a => a.nombre).map(a => a.nombre);
        const extra = g.pases_asignados > 1
            ? (acompNombres.length ? `\n\nAcompanantes registrados: ${acompNombres.join(', ')}` : '')
            : '';
        const msg = `Hola ${g.nombre}\n\nTe invitamos a *${evName}*${evDate}.\n\n${link}\n\nTienes *${g.pases_asignados} ${g.pases_asignados === 1 ? 'pase' : 'pases'}*.${extra}\n\nConfirma desde el enlace.`;

        await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${id}`, {
            method: 'PATCH', headers: { ...SB_H, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status: 'enviada', fecha_envio: new Date().toISOString() })
        });
        const idx = guests.findIndex(x => x.id === id);
        if (idx >= 0) { guests[idx].status = 'enviada'; guests[idx].fecha_envio = new Date().toISOString(); }
        renderAll();

        const phone = g.telefono ? g.telefono.replace(/\D/g, '') : '';
        window.open(phone ? `https://wa.me/52${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
    }

    // ── Confirmar manualmente ────────────────────────────────────────────────
    function confirmManual(id) {
        const g = guests.find(x => x.id === id);
        if (!g) return;
        const acomps = g._acomps || [];

        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

        let nombresHtml = '';
        const total = g.pases_asignados || 1;
        for (let i = 0; i < total; i++) {
            const val = i === 0 ? g.nombre : (acomps[i-1]?.nombre || '');
            const ro = i === 0 ? 'style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem;box-sizing:border-box;margin-bottom:6px;background:#f0f0f0;" readonly' : 'style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:.9rem;box-sizing:border-box;margin-bottom:6px;"';
            nombresHtml += `<input type="text" class="_mc_nombre" value="${val}" placeholder="Nombre persona ${i+1}" ${ro}>`;
        }

        overlay.innerHTML = `
            <div style="background:#fff;border-radius:14px;padding:32px;max-width:400px;width:90%;font-family:'Lato',sans-serif;max-height:90vh;overflow-y:auto;">
                <h3 style="margin:0 0 6px;">Confirmacion manual</h3>
                <p style="color:#666;font-size:.9rem;margin:0 0 20px;"><strong>${g.nombre}</strong> — ${total} pases</p>
                <label style="font-size:.82rem;font-weight:700;display:block;margin-bottom:6px;">Asistira?</label>
                <div style="display:flex;gap:10px;margin-bottom:18px;">
                    <button id="_mc_si" style="flex:1;padding:10px;border-radius:8px;border:2px solid #55efc4;background:#f0fff8;font-weight:700;cursor:pointer;">Si</button>
                    <button id="_mc_no" style="flex:1;padding:10px;border-radius:8px;border:2px solid #ccc;background:#f9f9f9;font-weight:700;cursor:pointer;">No</button>
                </div>
                <label style="font-size:.82rem;font-weight:700;display:block;margin-bottom:6px;">Pases confirmados</label>
                <input id="_mc_pases" type="number" min="0" max="${total}" value="${total}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:1rem;box-sizing:border-box;margin-bottom:14px;">
                <label style="font-size:.82rem;font-weight:700;display:block;margin-bottom:6px;">Nombres (titular + acompanantes)</label>
                <div id="_mc_nombres">${nombresHtml}</div>
                <div style="display:flex;gap:10px;margin-top:18px;">
                    <button id="_mc_cancel" style="flex:1;padding:10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;">Cancelar</button>
                    <button id="_mc_save" style="flex:1;padding:10px;border-radius:8px;background:#6c5ce7;color:#fff;border:none;font-weight:700;cursor:pointer;">Guardar</button>
                </div>
            </div>`;

        let selected = 'si';
        overlay.querySelector('#_mc_si').addEventListener('click', () => { selected = 'si'; overlay.querySelector('#_mc_si').style.borderColor = '#55efc4'; overlay.querySelector('#_mc_no').style.borderColor = '#ccc'; });
        overlay.querySelector('#_mc_no').addEventListener('click', () => { selected = 'no'; overlay.querySelector('#_mc_no').style.borderColor = '#d63031'; overlay.querySelector('#_mc_si').style.borderColor = '#ccc'; });
        overlay.querySelector('#_mc_cancel').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#_mc_save').addEventListener('click', async () => {
            const asiste = selected === 'si';
            const pases = parseInt(overlay.querySelector('#_mc_pases').value) || 0;
            const nombres = Array.from(overlay.querySelectorAll('._mc_nombre')).map(inp => inp.value.trim());
            const acompNames = nombres.slice(1); // sin el titular
            overlay.remove();
            // Actualizar invitado
            await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${id}`, {
                method: 'PATCH', headers: { ...SB_H, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ status: asiste ? 'confirmada' : 'declinada', asiste, pases_confirmados: pases, fecha_confirmacion: new Date().toISOString() })
            });
            // Recrear acompanantes
            await fetch(`${SB_URL}/rest/v1/acompanantes?invitado_id=eq.${id}`, { method: 'DELETE', headers: SB_H });
            if (acompNames.length) {
                await fetch(`${SB_URL}/rest/v1/acompanantes`, {
                    method: 'POST', headers: { ...SB_H, 'Prefer': 'return=minimal' },
                    body: JSON.stringify(acompNames.map((n, i) => ({ invitado_id: id, nombre: n, orden: i })))
                });
            }
            await loadGuests();
            showToast(asiste ? '✓ Confirmado' : '✓ Declinado');
        });
        document.body.appendChild(overlay);
    }

    async function copyLink(id) {
        const g = guests.find(x => x.id === id);
        if (!g) return;
        try { await navigator.clipboard.writeText(`${BASE_URL}/index.html?inv=${g.token}`); showToast('✓ Link copiado'); }
        catch(e) { prompt('Copia:', `${BASE_URL}/index.html?inv=${g.token}`); }
    }

    // ── Stats ────────────────────────────────────────────────────────────────
    /* Personas que representa un registro. Una invitación puede ser
       para una persona o para una familia entera; el titular cuenta
       dentro de sus pases. Quien declinó no ocupa lugar. */
    function personasDe(g) {
        if (g.status === 'declinada' || g.asiste === false) return 0;
        return g.pases_confirmados || g.pases_asignados || 0;
    }

    function sumaPersonas(lista) {
        return lista.reduce((s, g) => s + personasDe(g), 0);
    }

    function calcStats() {
        const confirmados = guests.filter(g => g.status === 'confirmada');
        const declinados  = guests.filter(g => g.status === 'declinada');
        const pendientes  = guests.filter(g => ['pendiente','enviada','vista'].includes(g.status));
        const llegaron    = guests.filter(g => g.checkin_at);
        return {
            total: guests.length,
            confirmados: confirmados.length,
            declinados: declinados.length,
            pendientes: pendientes.length,
            totalPases: guests.reduce((s, g) => s + (g.pases_asignados || 0), 0),
            totalAsisten: sumaPersonas(guests),
            persConfirmados: sumaPersonas(confirmados),
            persPendientes: sumaPersonas(pendientes),
            persDeclinados: declinados.reduce((s, g) => s + (g.pases_asignados || 0), 0),
            llegaron: llegaron.length,
            persLlegaron: llegaron.reduce((s, g) => s + (g.pases_llegaron || 0), 0),
            catFamilia: guests.filter(g => g.categoria === 'familia').length,
            catPadrinos: guests.filter(g => g.categoria === 'padrinos').length,
            catAmigos: guests.filter(g => g.categoria === 'amigos').length,
            catConocidos: guests.filter(g => g.categoria === 'conocidos').length
        };
    }

    function renderAll() { renderStats(); renderTable(); renderCategories(); renderMesas(); }

    function renderStats() {
        const s = calcStats(), set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        const invs = n => n === 1 ? 'en 1 invitación' : 'en ' + n + ' invitaciones';

        /* Todo se cuenta en PERSONAS: una invitación de 10 pases es
           una invitación para 10 personas. El número de invitaciones
           va abajo, como referencia de cuántos mensajes se mandan. */
        set('totalInvitados', s.totalPases);      set('totalPases', invs(s.total));
        set('totalAsistentes', s.totalAsisten);   set('detalleAsistentes', 'quedan por venir');
        set('confirmados', s.persConfirmados);    set('personasConfirmadas', invs(s.confirmados));
        set('pendientes', s.persPendientes);      set('personasPendientes', invs(s.pendientes));
        set('noAsistiran', s.persDeclinados);     set('personasDeclinadas', invs(s.declinados));
        set('yaLlegaron', s.persLlegaron);        set('personasLlegaron', invs(s.llegaron));
    }

    /* ── Plano del salón ──────────────────────────────────────────────────────
       Dibuja las mesas como se ven en el salón: un plato redondo con sus
       sillas alrededor. Las sillas ocupadas llevan el nombre de quien se
       sienta ahí, tomado del titular y de sus acompañantes registrados.

       De dónde salen los nombres:
         · Liga personalizada → el titular ya trae sus pases asignados y los
           acompañantes que haya capturado al confirmar.
         · Invitación genérica → quien se registra escribe su nombre y el de
           sus acompañantes, y caen igual en la tabla `acompanantes`.
       Cuando hay más pases que nombres, las sillas restantes quedan como
       "sin nombre": son lugares apartados que todavía nadie identificó. */

    const CAP_KEY = 'foro7_cap_mesa_' + (EVENTO_SLUG || 'x');

    /* Nombres de la mesa principal: el festejado y sus papás, tomados de
       eventos_config. Se pueden sumar invitados poniéndoles como mesa
       "principal", "novios", "honor" o "festejados". */
    let principal = { titulo: 'Mesa principal', nombres: [] };

    const ALIAS_PRINCIPAL = ['principal', 'novios', 'honor', 'festejados', 'festejado', 'quinceanera', 'quinceañera'];

    function esMesaPrincipal(m) {
        return ALIAS_PRINCIPAL.indexOf((m || '').trim().toLowerCase()) !== -1;
    }

    async function cargarProtagonistas(eid) {
        try {
            const r = await fetch(`${SB_URL}/rest/v1/eventos_config?evento_id=eq.${eid}&seccion=eq.protagonistas&select=datos&limit=1`, { headers: SB_H });
            const [fila] = await r.json();
            const d = (fila && fila.datos) || {};
            const nombres = [];
            if (d.nombre) nombres.push({ nombre: d.nombre, rol: cfg.eventName && /3 A/i.test(cfg.eventName) ? 'Festejado' : 'Festejada' });
            // Evento doble (XV + 3 años): cada festejada trae su propio campo
            if (d.xv_nombre)   nombres.push({ nombre: d.xv_nombre,   rol: 'XV años' });
            if (d.tres_nombre) nombres.push({ nombre: d.tres_nombre, rol: '3 años' });
            if (d.nombre_padre) nombres.push({ nombre: d.nombre_padre, rol: 'Papá' });
            if (d.nombre_madre) nombres.push({ nombre: d.nombre_madre, rol: 'Mamá' });
            principal.nombres = nombres;
            renderMesas();
        } catch (e) { /* si falla, la mesa principal sale solo con lo asignado */ }
    }

    function capacidadMesa() {
        const n = parseInt(localStorage.getItem(CAP_KEY), 10);
        return (!isNaN(n) && n >= 2 && n <= 20) ? n : 10;
    }

    /* Personas y nombres de un invitado, en el orden en que se sientan. */
    function ocupantes(g) {
        const total = g.pases_confirmados || g.pases_asignados || 1;
        const nombres = [g.nombre];
        (g._acomps || []).forEach(a => { if (a.nombre) nombres.push(a.nombre); });
        // Pases apartados que todavía no tienen nombre
        while (nombres.length < total) nombres.push(null);
        return nombres.slice(0, Math.max(total, nombres.length));
    }

    function agruparPorMesa() {
        const mapa = {};
        guests.forEach(g => {
            if (g.asiste === false || g.status === 'declinada') return;   // no ocupa lugar
            let m = (g.mesa_asignada || '').trim() || '__sin__';
            if (esMesaPrincipal(m)) m = '__principal__';
            (mapa[m] = mapa[m] || []).push(g);
        });
        return mapa;
    }

    function ordenMesas(claves) {
        return claves.sort((a, b) => {
            if (a === '__principal__') return -1;     // siempre primero
            if (b === '__principal__') return 1;
            if (a === '__sin__') return 1;
            if (b === '__sin__') return -1;
            const na = parseInt(a, 10), nb = parseInt(b, 10);
            if (!isNaN(na) && !isNaN(nb)) return na - nb;
            return a.localeCompare(b, 'es');
        });
    }

    function renderMesas() {
        const cont = document.getElementById('mesasGrid');
        if (!cont) return;

        const cap   = capacidadMesa();
        const capIn = document.getElementById('capMesa');
        if (capIn && capIn.value !== String(cap)) capIn.value = cap;

        const mapa   = agruparPorMesa();
        const claves = ordenMesas(Object.keys(mapa));

        if (!claves.length) {
            cont.innerHTML = '<p style="color:#999">Todavía no hay invitados que acomodar.</p>';
            const r = document.getElementById('mesasResumen');
            if (r) r.textContent = '';
            return;
        }

        let totalPersonas = 0, mesasLlenas = 0, sobrecupo = 0;

        // La mesa principal existe aunque nadie esté asignado a ella
        if (claves.indexOf('__principal__') === -1 && principal.nombres.length) {
            claves.unshift('__principal__');
            mapa.__principal__ = [];
        }

        cont.innerHTML = claves.map(m => {
            if (m === '__principal__') {
                /* Los protagonistas ya vienen de eventos_config. Si
                   además hay invitados asignados a esta mesa, se
                   fusionan por nombre para no repetir lugares. */
                const clave = s => (s || '').toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ').trim();

                const gente = principal.nombres.map(x => ({ nombre: x.nombre, rol: x.rol, llego: false }));
                const porNombre = {};
                gente.forEach((p, i) => { porNombre[clave(p.nombre)] = i; });

                (mapa.__principal__ || []).forEach(g => {
                    ocupantes(g).forEach(n => {
                        const k = clave(n);
                        if (n && porNombre[k] !== undefined) {
                            // Ya está como protagonista: solo se marca su llegada
                            if (g.checkin_at) gente[porNombre[k]].llego = true;
                            return;
                        }
                        const nuevo = { nombre: n, llego: !!g.checkin_at, rol: '' };
                        if (n) porNombre[k] = gente.length;
                        gente.push(nuevo);
                    });
                });
                totalPersonas += gente.length;
                const lugares = gente.map(p =>
                    `<span class="lugar-principal${p.llego ? ' llego' : ''}">
                        <span class="lp-nombre">${p.nombre}</span>
                        ${p.rol ? `<span class="lp-rol">${p.rol}</span>` : ''}
                    </span>`).join('');
                return `<div class="plano-mesa principal">
                    <div class="mesa-larga">
                        <div class="mesa-larga-et">👑 ${principal.titulo}</div>
                        <div class="mesa-larga-lugares">${lugares || '<em style="color:#aaa">Sin nombres capturados</em>'}</div>
                    </div>
                    <div class="plano-pie">${gente.length} ${gente.length === 1 ? 'lugar' : 'lugares'}</div>
                </div>`;
            }
            const lista = mapa[m];
            let gente = [];
            lista.forEach(g => {
                ocupantes(g).forEach(n => gente.push({ nombre: n, llego: !!g.checkin_at, titular: g.nombre }));
            });
            const ocupadas = gente.length;
            totalPersonas += ocupadas;

            const esSin = (m === '__sin__');
            const libres = Math.max(0, cap - ocupadas);
            if (!esSin && libres === 0 && ocupadas === cap) mesasLlenas++;
            if (!esSin && ocupadas > cap) sobrecupo++;

            // Sillas: se dibujan tantas como capacidad, o más si hay sobrecupo
            const sillas = Math.max(cap, ocupadas);
            let aros = '';
            for (let k = 0; k < sillas; k++) {
                const ang = (360 / sillas) * k - 90;
                const p = gente[k];
                const cls = p ? (p.llego ? 'silla ocupada llego' : 'silla ocupada')
                              : 'silla';
                const tip = p ? (p.nombre || 'Lugar apartado (sin nombre)') : 'Lugar libre';
                aros += `<span class="${cls}" style="transform:rotate(${ang}deg) translate(66px) rotate(${-ang}deg)" title="${tip}"></span>`;
            }

            const estado = esSin ? 'sin' : (ocupadas > cap ? 'excedida' : (ocupadas === 0 ? 'vacia' : (libres === 0 ? 'llena' : '')));
            const titulo = esSin ? 'Sin mesa' : m;

            const nombres = gente.map(p => `<li class="${p.llego ? 'llego' : ''}${p.nombre ? '' : ' anon'}">${p.nombre || '<em>sin nombre</em>'}</li>`).join('');

            return `<div class="plano-mesa ${estado}" data-mesa="${m}">
                <div class="plano-figura">
                    <div class="plato">
                        <span class="plato-num">${titulo}</span>
                        <span class="plato-gente">${ocupadas}${esSin ? '' : '/' + cap}</span>
                    </div>
                    ${aros}
                </div>
                <div class="plano-pie">
                    ${esSin ? '<strong>Falta asignarles mesa</strong>'
                            : (ocupadas > cap ? `<strong class="alerta">${ocupadas - cap} de más</strong>`
                                              : `${libres} ${libres === 1 ? 'lugar libre' : 'lugares libres'}`)}
                </div>
                <ul class="plano-lista">${nombres || '<li class="anon"><em>vacía</em></li>'}</ul>
            </div>`;
        }).join('');

        const resumen = document.getElementById('mesasResumen');
        if (resumen) {
            const nMesas = claves.filter(c => c !== '__sin__').length;
            const sinMesa = (mapa.__sin__ || []).length;
            resumen.innerHTML = `<strong>${nMesas}</strong> ${nMesas === 1 ? 'mesa' : 'mesas'} · ` +
                `<strong>${totalPersonas}</strong> personas acomodadas` +
                (mesasLlenas ? ` · ${mesasLlenas} llena${mesasLlenas === 1 ? '' : 's'}` : '') +
                (sobrecupo ? ` · <span class="alerta">${sobrecupo} con sobrecupo</span>` : '') +
                (sinMesa ? ` · <span class="alerta">${sinMesa} sin mesa</span>` : '');
        }
    }

    function cambiarCapacidad(v) {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < 2 || n > 20) return;
        localStorage.setItem(CAP_KEY, n);
        renderMesas();
    }

    function imprimirPlano() {
        document.body.classList.add('solo-plano');
        window.print();
        setTimeout(() => document.body.classList.remove('solo-plano'), 500);
    }

    /* ── Código QR del invitado ───────────────────────────────────────────────
       Codifica su liga personal, así que el mismo código sirve para abrir la
       invitación antes del evento y para registrar la llegada en la puerta. */
    function mostrarQR(id) {
        const g = guests.find(x => x.id === id);
        if (!g) return;
        const url = `${BASE_URL}?inv=${g.token}`;
        const modal = document.getElementById('qrModal');
        const caja  = document.getElementById('qrCanvas');
        if (!modal || !caja) return;

        document.getElementById('qrNombre').textContent = g.nombre;
        document.getElementById('qrMesa').textContent = g.mesa_asignada ? ('Mesa ' + g.mesa_asignada) : 'Sin mesa asignada';
        document.getElementById('qrPases').textContent =
            (g.pases_asignados || 1) + ((g.pases_asignados || 1) === 1 ? ' pase' : ' pases');
        caja.innerHTML = '';

        if (typeof QRCode === 'undefined') {
            caja.innerHTML = '<p style="color:#c0392b">No cargó el generador de códigos. Revisa tu conexión.</p>';
        } else {
            new QRCode(caja, { text: url, width: 260, height: 260, correctLevel: QRCode.CorrectLevel.M });
        }
        modal.dataset.nombre = g.nombre;
        modal.classList.add('show');
    }

    function descargarQR() {
        const modal = document.getElementById('qrModal');
        const cv = document.querySelector('#qrCanvas canvas');
        if (!cv) { showToast('El código aún no está listo'); return; }
        const nombre = (modal.dataset.nombre || 'invitado').replace(/[^a-zA-Z0-9]+/g, '-');
        const a = document.createElement('a');
        a.href = cv.toDataURL('image/png');
        a.download = 'QR-' + nombre + '.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }

    function cerrarQR() {
        const m = document.getElementById('qrModal');
        if (m) m.classList.remove('show');
    }

    function renderCategories() {
        const s = calcStats(), set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
        set('catFamilia', s.catFamilia); set('catPadrinos', s.catPadrinos);
        set('catAmigos', s.catAmigos); set('catConocidos', s.catConocidos);
    }

    const SL = {
        pendiente: { i:'🔴', t:'Pendiente', c:'status-pendiente' },
        enviada: { i:'🟡', t:'Enviada', c:'status-enviada' },
        vista: { i:'🔵', t:'Vista', c:'status-vista' },
        confirmada: { i:'🟢', t:'Confirmada', c:'status-confirmada' },
        declinada: { i:'⚫', t:'Declinada', c:'status-declinada' }
    };

    function fmtDate(iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    }

    function renderNombres(g) {
        const acomps = g._acomps || [];
        if (!acomps.length) return '—';
        const filled = acomps.filter(a => a.nombre);
        const empty = acomps.length - filled.length;
        let html = '<div class="nombres-list">';
        filled.forEach(a => { html += `<span>• ${a.nombre}</span>`; });
        if (empty > 0) html += `<span style="opacity:.5">+ ${empty} sin nombre</span>`;
        html += '</div>';
        return html;
    }

    function renderTable() {
        const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
        const tbody = document.getElementById('guestsTableBody');
        if (!tbody) return;
        const filtered = guests.filter(g => {
            const mf = currentFilter === 'all' || g.status === currentFilter;
            const ms = !search || g.nombre.toLowerCase().includes(search) || (g.telefono || '').includes(search);
            return mf && ms;
        });
        if (!filtered.length) { tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:30px;color:#999;">No hay invitados</td></tr>'; return; }

        tbody.innerHTML = filtered.map(g => {
            const s = SL[g.status] || SL.pendiente;
            const pConf = g.pases_confirmados ? `<strong>${g.pases_confirmados}</strong>` : '—';
            return `<tr>
                <td class="celda-check"><input type="checkbox" class="sel-invitado" data-id="${g.id}"></td>
                <td><strong>${g.nombre}</strong>${g.notas ? `<br><small style="color:#999">${g.notas}</small>` : ''}${g.mensaje ? `<br><small style="color:#6c5ce7;font-style:italic">"${g.mensaje}"</small>` : ''}</td>
                <td><span class="badge-cat cat-${g.categoria||'otro'}">${g.categoria||'—'}</span></td>
                <td style="text-align:center">${g.pases_asignados}</td>
                <td style="text-align:center">${pConf}</td>
                <td>${renderNombres(g)}</td>
                <td class="celda-mesa">
                    <input class="mesa-input" value="${g.mesa_asignada || ''}" placeholder="—"
                           data-id="${g.id}" data-antes="${g.mesa_asignada || ''}"
                           title="Escribe la mesa y sal del campo para guardar">
                </td>
                <td><span class="status-badge ${s.c}">${s.i} ${s.t}</span>${g.checkin_at ? `<br><small style="color:#2e9e5b;font-weight:700">✓ Llegó ${new Date(g.checkin_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})} (${g.pases_llegaron||0})</small>` : ''}</td>
                <td style="font-size:.78rem">${fmtDate(g.fecha_envio)}<br>${fmtDate(g.fecha_confirmacion)}</td>
                <td><div class="action-group">
                    ${g.telefono ? `<button class="btn-wa" onclick="RSVP_ADMIN.sendWhatsApp('${g.id}')"><i class="fab fa-whatsapp"></i></button>` : `<button class="btn-copy" onclick="RSVP_ADMIN.confirmManual('${g.id}')" style="background:#f39c12"><i class="fas fa-user-check"></i></button>`}
                    <button class="btn-copy" onclick="RSVP_ADMIN.copyLink('${g.id}')"><i class="fas fa-link"></i></button>
                    <button class="btn-copy" onclick="RSVP_ADMIN.mostrarQR('${g.id}')" style="background:#2d3436" title="Código QR"><i class="fas fa-qrcode"></i></button>
                </div></td>
                <td><div class="action-group">
                    <button class="btn-edit" onclick="RSVP_ADMIN.openEdit('${g.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete" onclick="RSVP_ADMIN.deleteGuest('${g.id}')"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`;
        }).join('');

        engancharMesas();
    }

    /* ── Guardar la mesa al salir del campo ─────────────────────────────────── */
    function engancharMesas() {
        document.querySelectorAll('.mesa-input').forEach(inp => {
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
                if (e.key === 'Escape') { inp.value = inp.dataset.antes; inp.blur(); }
            });
            inp.addEventListener('blur', async () => {
                const valor = inp.value.trim();
                if (valor === inp.dataset.antes) return;
                inp.disabled = true;
                const ok = await guardarMesa(inp.dataset.id, valor);
                inp.disabled = false;
                if (ok) {
                    inp.dataset.antes = valor;
                    inp.classList.add('guardado');
                    setTimeout(() => inp.classList.remove('guardado'), 900);
                    renderStats(); renderMesas();
                } else {
                    inp.value = inp.dataset.antes;
                    showToast('No se pudo guardar la mesa');
                }
            });
        });

        const todos = document.getElementById('selTodos');
        if (todos) {
            todos.checked = false;
            todos.onclick = () => {
                document.querySelectorAll('.sel-invitado').forEach(c => { c.checked = todos.checked; });
                actualizarSeleccion();
            };
        }
        document.querySelectorAll('.sel-invitado').forEach(c => {
            c.addEventListener('change', actualizarSeleccion);
        });
        actualizarSeleccion();
    }

    async function guardarMesa(id, valor) {
        try {
            const r = await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${id}`, {
                method: 'PATCH', headers: { ...SB_H, Prefer: 'return=minimal' },
                body: JSON.stringify({ mesa_asignada: valor || null })
            });
            if (!r.ok) return false;
            const g = guests.find(x => x.id === id);
            if (g) g.mesa_asignada = valor || null;
            return true;
        } catch (e) { return false; }
    }

    /* ── Asignación en lote ─────────────────────────────────────────────────── */
    function actualizarSeleccion() {
        const n = document.querySelectorAll('.sel-invitado:checked').length;
        const et = document.getElementById('selConteo');
        const bt = document.getElementById('btnAsignarLote');
        if (et) et.textContent = n ? `${n} seleccionado${n === 1 ? '' : 's'}` : 'Ninguno seleccionado';
        if (bt) bt.disabled = !n;
    }

    async function asignarLote() {
        const mesa = (document.getElementById('mesaLote').value || '').trim();
        const ids = Array.from(document.querySelectorAll('.sel-invitado:checked')).map(c => c.dataset.id);
        if (!ids.length) return;
        const bt = document.getElementById('btnAsignarLote');
        bt.disabled = true; bt.textContent = 'Asignando…';
        let ok = 0;
        for (const id of ids) { if (await guardarMesa(id, mesa)) ok++; }
        bt.textContent = 'Asignar mesa';
        showToast(mesa ? `✓ ${ok} a la mesa ${mesa}` : `✓ ${ok} sin mesa`);
        renderAll();
    }

    // ── Modal con campos de acompanantes ─────────────────────────────────────
    function buildAcompFields(count, existing) {
        const container = document.getElementById('acompContainer');
        if (!container) return;
        container.innerHTML = '';
        const numAcomp = Math.max(0, count - 1); // -1 porque el titular ya esta
        for (let i = 0; i < numAcomp; i++) {
            const val = existing[i] || '';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'acomp-name-input';
            inp.placeholder = `Acompanante ${i + 1}`;
            inp.value = val;
            inp.style.cssText = 'width:100%;padding:10px;margin-bottom:6px;border:2px solid var(--border,#dfe6e9);border-radius:8px;font-size:.95rem;';
            container.appendChild(inp);
        }
        const group = document.getElementById('acompGroup');
        if (group) group.style.display = numAcomp > 0 ? 'block' : 'none';
    }

    function openAddGuestModal() {
        editingId = null;
        document.getElementById('modalTitle').textContent = 'Agregar Invitado';
        document.getElementById('guestForm').reset();
        buildAcompFields(1, []);
        document.getElementById('guestModal').style.display = 'flex';
    }

    function openEdit(id) {
        const g = guests.find(x => x.id === id);
        if (!g) return;
        editingId = id;
        document.getElementById('modalTitle').textContent = 'Editar Invitado';
        document.getElementById('guestName').value = g.nombre || '';
        document.getElementById('guestPhone').value = g.telefono || '';
        document.getElementById('guestCategory').value = g.categoria || 'familia';
        document.getElementById('guestPases').value = g.pases_asignados || 1;
        document.getElementById('guestTable').value = g.mesa_asignada || '';
        document.getElementById('guestNotes').value = g.notas || '';
        const existingNames = (g._acomps || []).map(a => a.nombre);
        buildAcompFields(g.pases_asignados || 1, existingNames);
        document.getElementById('guestModal').style.display = 'flex';
    }

    function closeGuestModal() { document.getElementById('guestModal').style.display = 'none'; editingId = null; }

    function showToast(msg) {
        let el = document.getElementById('rsvp-toast');
        if (!el) { el = document.createElement('div'); el.id = 'rsvp-toast'; el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1c1c1c;color:#fff;padding:10px 22px;border-radius:8px;font-size:.88rem;z-index:9999;opacity:0;transition:opacity .3s;pointer-events:none;'; document.body.appendChild(el); }
        el.textContent = msg; el.style.opacity = '1';
        clearTimeout(el._t); el._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
    }

    function showError(msg) {
        const tbody = document.getElementById('guestsTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:30px;color:#e74c3c;">${msg}</td></tr>`;
    }

    /* ── Lista imprimible ─────────────────────────────────────────────────────
       Abre el diálogo de impresión del navegador, que también permite
       "Guardar como PDF". Es la lista que se lleva en papel a la puerta. */
    function imprimirLista() {
        const ordenados = guests.slice().sort((a, b) => {
            const ma = (a.mesa_asignada || '~').toString(), mb = (b.mesa_asignada || '~').toString();
            const na = parseInt(ma, 10), nb = parseInt(mb, 10);
            if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
            if (ma !== mb) return ma.localeCompare(mb, 'es');
            return a.nombre.localeCompare(b.nombre, 'es');
        });

        const filas = ordenados.map(g => {
            const acomp = (g._acomps || []).filter(a => a.nombre).map(a => a.nombre).join(', ');
            const pases = g.pases_confirmados || g.pases_asignados || 1;
            const est = (SL[g.status] || SL.pendiente).t;
            return `<tr>
                <td class="c">${g.mesa_asignada || '—'}</td>
                <td><strong>${g.nombre}</strong>${acomp ? `<br><span class="ac">${acomp}</span>` : ''}</td>
                <td class="c">${pases}</td>
                <td>${est}</td>
                <td class="c">${g.checkin_at ? '✓' : '☐'}</td>
            </tr>`;
        }).join('');

        const total = guests.reduce((n, g) => n + (g.pases_confirmados || g.pases_asignados || 0), 0);
        const w = window.open('', '_blank');
        if (!w) { showToast('El navegador bloqueó la ventana de impresión'); return; }
        w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
            <title>Lista de invitados</title>
            <style>
              body { font-family: system-ui, sans-serif; padding: 24px; color: #222; }
              h1 { font-size: 1.2rem; margin-bottom: 2px; }
              .sub { color: #666; font-size: .85rem; margin-bottom: 16px; }
              table { width: 100%; border-collapse: collapse; font-size: .82rem; }
              th { text-align: left; border-bottom: 2px solid #333; padding: 6px 8px; font-size: .72rem;
                   text-transform: uppercase; letter-spacing: .08em; }
              td { border-bottom: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
              td.c, th.c { text-align: center; }
              .ac { color: #666; font-size: .76rem; }
              tr { break-inside: avoid; }
              @media print { body { padding: 0; } }
            </style></head><body>
            <h1>${cfg.eventName || 'Lista de invitados'}</h1>
            <div class="sub">${cfg.eventDate || ''} · ${guests.length} invitados · ${total} personas</div>
            <table>
              <thead><tr><th class="c">Mesa</th><th>Nombre y acompañantes</th>
                <th class="c">Pases</th><th>Estado</th><th class="c">Llegó</th></tr></thead>
              <tbody>${filas}</tbody>
            </table>
            </body></html>`);
        w.document.close();
        setTimeout(() => { w.focus(); w.print(); }, 350);
    }

    function exportCSV() {
        const headers = ['Nombre','Telefono','Categoria','Pases','Conf.','Acompanantes','Mesa','Status','Mensaje'];
        const rows = guests.map(g => [
            g.nombre, g.telefono||'', g.categoria||'', g.pases_asignados,
            g.pases_confirmados||'', (g._acomps||[]).map(a=>a.nombre).filter(Boolean).join('; '),
            g.mesa_asignada||'', g.status, g.mensaje||''
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
        const a = document.createElement('a');
        a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent('\uFEFF' + [headers.join(','), ...rows].join('\n'));
        a.download = `invitados-${EVENTO_SLUG}-${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); showToast('✓ CSV descargado');
    }

    // ── Init ─────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        if (!checkPin()) return;
        loadGuests();

        document.getElementById('searchInput')?.addEventListener('input', renderTable);

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                currentFilter = this.dataset.filter || 'all';
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                renderTable();
            });
        });

        // Cuando cambie pases, regenerar campos acompanantes
        const pasesInput = document.getElementById('guestPases');
        if (pasesInput) {
            pasesInput.addEventListener('input', function () {
                const existing = Array.from(document.querySelectorAll('.acomp-name-input')).map(i => i.value);
                buildAcompFields(parseInt(this.value) || 1, existing);
            });
        }

        const form = document.getElementById('guestForm');
        if (form) {
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                const data = {
                    nombre: document.getElementById('guestName').value.trim(),
                    telefono: document.getElementById('guestPhone').value.trim() || null,
                    categoria: document.getElementById('guestCategory').value || 'familia',
                    pases_asignados: parseInt(document.getElementById('guestPases').value) || 1,
                    mesa_asignada: document.getElementById('guestTable').value.trim() || null,
                    notas: document.getElementById('guestNotes').value.trim() || null
                };
                const nombresAcomp = Array.from(document.querySelectorAll('.acomp-name-input'))
                    .map((inp, i) => ({ nombre: inp.value.trim(), orden: i }))
                    .map(a => a.nombre); // guardamos todos, incluso vacios
                const btn = form.querySelector('.btn-save');
                if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...'; }
                await saveGuest(data, nombresAcomp);
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Invitado'; }
                closeGuestModal();
                showToast('✓ Invitado guardado');
            });
        }

        window.openAddGuestModal = openAddGuestModal;
        window.closeGuestModal = closeGuestModal;
    });

    window.RSVP_ADMIN = { sendWhatsApp, copyLink, deleteGuest, openEdit, confirmManual, mostrarQR, descargarQR, cerrarQR, cambiarCapacidad, imprimirPlano, asignarLote, exportCSV, imprimirLista };
})();
