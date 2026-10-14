// musica-youtube.js — la música de la invitación sale del video oficial en YouTube.
// Expone window.musicaYT con la misma forma que un <audio> (play/pause/paused)
// para que el sobre y el botón de música no tengan que saber de dónde viene.
window.musicaYT = (function () {
    const VIDEO = '2Vv-BfVoq4g'; // Ed Sheeran - Perfect (Official Music Video)
    let player = null, listo = false, quiereSonar = false;
    const esperando = [];

    const api = {
        paused: true,
        onchange: null,
        play() {
            quiereSonar = true;
            return new Promise((resolve, reject) => {
                // Si el navegador no deja sonar sin tocar el video, se avisa para mostrarlo
                const t = setTimeout(() => { if (api.paused) reject(new Error('bloqueado')); }, 3000);
                esperando.push(() => { clearTimeout(t); resolve(); });
                if (listo) player.playVideo();
            });
        },
        pause() {
            quiereSonar = false;
            if (listo) player.pauseVideo();
            api.paused = true;
        }
    };

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('ytPlayer', {
            videoId: VIDEO,
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1, loop: 1, playlist: VIDEO },
            events: {
                onReady() { listo = true; if (quiereSonar) player.playVideo(); },
                onStateChange(e) {
                    const sonando = e.data === YT.PlayerState.PLAYING;
                    api.paused = !sonando;
                    if (sonando) esperando.splice(0).forEach(f => f());
                    if (e.data === YT.PlayerState.ENDED) player.playVideo();
                    if (api.onchange) api.onchange(sonando);
                }
            }
        });
    };

    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
    return api;
})();
