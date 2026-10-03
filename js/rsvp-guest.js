// rsvp-guest.js — Sistema RSVP Profesional (lado del invitado)
// Lee ?inv=TOKEN, carga datos desde Supabase, maneja confirmación
(function () {
    const SB_URL  = 'https://nzpujmlienzfetqcgsxz.supabase.co';
    const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56cHVqbWxpZW56ZmV0cWNnc3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2ODYzMzYsImV4cCI6MjA5MDI2MjMzNn0.xl3lsb-KYj5tVLKTnzpbsdEGoV9ySnswH4eyRuyEH1s';
    const SB_H = { 'apikey': SB_ANON, 'Authorization': 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' };

    const token = new URLSearchParams(window.location.search).get('inv');
    if (!token) return; // No hay token — invitación genérica, nada que hacer

    let guestData = null;
    let submitAttached = false;

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const personas = n => `${n} ${n === 1 ? 'persona' : 'personas'}`;

    // ── Cargar invitado por token ────────────────────────────────────────────
    async function loadGuest() {
        try {
            const r = await fetch(
                `${SB_URL}/rest/v1/invitados?token=eq.${encodeURIComponent(token)}&select=id,nombre,pases_asignados,mesa_asignada,status,asiste,confirmacion_nombre,pases_confirmados,mensaje`,
                { headers: SB_H }
            );
            const rows = await r.json();
            if (!rows.length) { showNotFound(); return; }
            guestData = rows[0];
            renderGuestExperience();
        } catch (e) {
            console.warn('RSVP: error cargando invitado', e);
        }
    }

    // ── Marcar como vista ────────────────────────────────────────────────────
    async function markAsViewed(id) {
        try {
            await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${id}`, {
                method: 'PATCH',
                headers: Object.assign({}, SB_H, { 'Prefer': 'return=minimal' }),
                body: JSON.stringify({ status: 'vista', fecha_vista: new Date().toISOString() })
            });
        } catch (e) {}
    }

    // ── Enviar confirmación ──────────────────────────────────────────────────
    async function submitRSVP(asiste, pases, nombre, mensaje) {
        const body = {
            status:              asiste ? 'confirmada' : 'declinada',
            asiste:              asiste,
            confirmacion_nombre: nombre,
            pases_confirmados:   pases,
            mensaje:             mensaje || null,
            fecha_confirmacion:  new Date().toISOString()
        };
        const r = await fetch(`${SB_URL}/rest/v1/invitados?id=eq.${guestData.id}`, {
            method: 'PATCH',
            headers: Object.assign({}, SB_H, { 'Prefer': 'return=minimal' }),
            body: JSON.stringify(body)
        });
        return r.ok;
    }

    // ── Renderizar experiencia personalizada ─────────────────────────────────
    function renderGuestExperience() {
        const g = guestData;

        // Personalizar sección de bienvenida
        const section  = document.getElementById('personalizedWelcome');
        const textEl   = document.getElementById('guestWelcomeText');
        const pasesEl  = document.getElementById('guestPassesText');
        const mesaEl   = document.getElementById('guestTableText');
        if (section && textEl && pasesEl) {
            textEl.textContent = `${g.nombre}, nos encantará celebrar contigo`;
            pasesEl.innerHTML  = `<i class="fa-solid fa-ticket"></i> ${g.pases_asignados} ${g.pases_asignados === 1 ? 'pase asignado' : 'pases asignados'}`;
            if (mesaEl && g.mesa_asignada) {
                mesaEl.innerHTML = `<i class="fa-solid fa-utensils"></i> ${esc(g.mesa_asignada)}`;
                mesaEl.hidden = false;
            }
            section.style.display = 'block';
        }

        // Mostrar sección de confirmación (solo existe para invitaciones personalizadas)
        const rsvpSection = document.getElementById('rsvp');
        if (rsvpSection) rsvpSection.hidden = false;

        // Pre-llenar formulario
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.value = g.confirmacion_nombre || g.nombre;

        // Limitar select de pases al número asignado
        const guestsSelect = document.getElementById('guests');
        if (guestsSelect) {
            guestsSelect.innerHTML = '';
            for (let i = 1; i <= g.pases_asignados; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = personas(i);
                guestsSelect.appendChild(opt);
            }
            guestsSelect.value = g.pases_confirmados || g.pases_asignados;
        }
        const messageInput = document.getElementById('message');
        if (messageInput && g.mensaje) messageInput.value = g.mensaje;

        // Si no asiste, el número de personas no aplica
        const attendance = document.getElementById('attendance');
        if (attendance && guestsSelect) {
            attendance.addEventListener('change', () => { guestsSelect.disabled = attendance.value === 'no'; });
        }

        attachFormSubmit();

        // Si ya confirmó → mostrar estado, ocultar form
        if (g.status === 'confirmada' || g.status === 'declinada') {
            showAlreadyConfirmed();
            return;
        }

        // Marcar como vista si estaba pendiente o enviada
        if (g.status === 'pendiente' || g.status === 'enviada') {
            markAsViewed(g.id);
        }
    }

    // ── Ya confirmó anteriormente ────────────────────────────────────────────
    function showAlreadyConfirmed() {
        const form = document.getElementById('rsvpForm');
        const successEl = document.getElementById('successMessage');
        if (!form || !successEl) return;
        const g = guestData;
        const asiste = g.asiste;
        form.style.display = 'none';
        successEl.style.display = 'block';
        successEl.innerHTML = `
            <p class="success-title"><i class="fa-solid ${asiste ? 'fa-circle-check' : 'fa-envelope-open-text'}"></i> ${asiste ? '¡Tu asistencia está confirmada!' : 'Gracias por avisarnos'}</p>
            <p>${asiste
                ? `Te esperamos con ${personas(g.pases_confirmados)}${g.mesa_asignada ? ` en la ${esc(g.mesa_asignada)}` : ''}.`
                : 'Lamentamos que no puedas acompañarnos en este día tan especial.'}</p>
            ${g.mensaje ? `<p class="success-quote">“${esc(g.mensaje)}”</p>` : ''}
            <button type="button" class="link-button" id="changeRsvp">Cambiar mi respuesta</button>`;
        document.getElementById('changeRsvp').addEventListener('click', () => {
            successEl.style.display = 'none';
            form.style.display = '';
            const attendance = document.getElementById('attendance');
            if (attendance) {
                attendance.value = asiste ? 'si' : 'no';
                attendance.dispatchEvent(new Event('change'));
            }
        });
    }

    // ── No encontrado ────────────────────────────────────────────────────────
    function showNotFound() {
        const section = document.getElementById('personalizedWelcome');
        if (section) {
            section.style.display = 'block';
            section.innerHTML = `
                <p class="eyebrow">Invitación personalizada</p>
                <h2>Enlace no válido</h2>
                <p>Este enlace de invitación no es válido o ha expirado.</p>`;
        }
    }

    // ── Enganchar submit del form ────────────────────────────────────────────
    function attachFormSubmit() {
        const form = document.getElementById('rsvpForm');
        if (!form || submitAttached) return;
        submitAttached = true;

        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const nombre    = (document.getElementById('name')?.value || '').trim();
            const asisteSel = document.getElementById('attendance')?.value;
            const mensaje   = (document.getElementById('message')?.value || '').trim();

            if (!nombre || !asisteSel) return;
            const asiste = asisteSel === 'si';
            const pases  = asiste ? parseInt(document.getElementById('guests')?.value || '1') : 0;

            const btn = form.querySelector('button[type="submit"]');
            const btnHtml = btn ? btn.innerHTML : '';
            if (btn) { btn.disabled = true; btn.innerHTML = '<span>Enviando…</span><i class="fa-solid fa-spinner fa-spin"></i>'; }

            const ok = await submitRSVP(asiste, pases, nombre, mensaje);
            if (btn) { btn.disabled = false; btn.innerHTML = btnHtml; }

            if (ok) {
                guestData.status              = asiste ? 'confirmada' : 'declinada';
                guestData.asiste              = asiste;
                guestData.pases_confirmados   = pases;
                guestData.confirmacion_nombre = nombre;
                guestData.mensaje             = mensaje;
                showAlreadyConfirmed();
            } else {
                alert('Hubo un error al enviar. Intenta de nuevo.');
            }
        });
    }

    // ── Init cuando el DOM esté listo ────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadGuest);
    } else {
        loadGuest();
    }

    window._rsvpGuestLoaded = true;
})();
