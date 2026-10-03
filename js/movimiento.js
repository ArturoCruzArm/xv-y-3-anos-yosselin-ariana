// movimiento.js — pétalos que caen y elementos que aparecen al bajar
(function () {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rnd = (a, b) => a + Math.random() * (b - a);

    // ── Pétalos: cada uno con su tamaño, color, velocidad y vaivén ──
    const petals = document.getElementById('petals');
    if (petals && !reduce) {
        const colores = [['#f3d3d3', '#c98a93'], ['#ecc4c8', '#a8566a'], ['#f7e3dc', '#d7a3a6'], ['#b5475d', '#6b1e2e']];
        const total = window.innerWidth < 600 ? 10 : 16;
        for (let i = 0; i < total; i++) {
            const p = document.createElement('span');
            const dorado = i % 4 === 3;
            const c = colores[i % colores.length];
            p.className = 'petal' + (dorado ? ' gold' : '');
            p.style.left = rnd(0, 100) + '%';
            p.style.setProperty('--s', rnd(10, 18) + 'px');
            p.style.setProperty('--c1', c[0]);
            p.style.setProperty('--c2', c[1]);
            p.style.setProperty('--d', rnd(11, 20) + 's');
            p.style.setProperty('--dl', (-rnd(0, 20)) + 's');
            p.style.setProperty('--x1', rnd(-60, 60) + 'px');
            p.style.setProperty('--x2', rnd(-90, 90) + 'px');
            p.style.setProperty('--sp', rnd(1.5, 3) + 's');
            petals.appendChild(p);
        }
    }

    // ── Aparecer al bajar ──
    const marcar = (sel, clase) => document.querySelectorAll(sel).forEach(el => el.classList.add(clase));
    marcar('.section-pad>h2, .count-intro>h2', 'write');
    marcar('.hero h1 span', 'write');
    marcar('.hero>.eyebrow, .hero-kicker, .surnames, .date-lockup, .section-pad>.eyebrow, .count-intro>.eyebrow, .lead, .story blockquote, .countdown, .family-frame, .share-actions', 'reveal');
    marcar('.info-card', 'reveal');
    marcar('.info-card, .family-frame', 'zoom');

    // Retraso escalonado entre hermanos para que no aparezcan todos juntos
    document.querySelectorAll('.reveal, .write').forEach(el => {
        const hermanos = [...el.parentElement.children].filter(x => x.classList.contains('reveal') || x.classList.contains('write'));
        el.style.setProperty('--rd', (hermanos.indexOf(el) * 0.14) + 's');
    });
    // Los nombres de la portada se escriben uno tras otro
    document.querySelectorAll('.hero h1 span').forEach((el, i) => el.style.setProperty('--rd', (0.3 + i * 0.9) + 's'));

    const empezar = () => {
        if (reduce || !('IntersectionObserver' in window)) {
            document.querySelectorAll('.reveal, .write').forEach(el => el.classList.add('in'));
            return;
        }
        // Un título recortado por clip-path no cuenta como visible, así que
        // los .write se disparan cuando entra su contenedor.
        const disparos = new Map();
        document.querySelectorAll('.reveal, .write').forEach(el => {
            const obj = el.classList.contains('write') ? el.parentElement : el;
            if (!disparos.has(obj)) disparos.set(obj, []);
            disparos.get(obj).push(el);
        });
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                disparos.get(e.target).forEach(el => el.classList.add('in'));
                io.unobserve(e.target);
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
        disparos.forEach((_, obj) => io.observe(obj));
    };

    // Esperar a que se abra el sobre para que la portada se vea aparecer
    if (!document.body.classList.contains('is-locked')) { empezar(); return; }
    const mo = new MutationObserver(() => {
        if (!document.body.classList.contains('is-locked')) { mo.disconnect(); empezar(); }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
