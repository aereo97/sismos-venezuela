// Service worker del Monitor Sismico.
// Objetivo: que la app abra aunque no haya red (el ultimo listado queda en pantalla)
// y que se pueda instalar en el telefono. NO cachea datos sismicos: esos siempre van a la red,
// porque servir un sismo viejo desde cache seria peor que no servir nada.
const VERSION = 'sismos-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest',
               './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', ev => {
    ev.waitUntil(
        caches.open(VERSION)
            .then(c => c.addAll(SHELL))
            .catch(() => {})            // si un fichero falla, el SW se instala igual
    );
    // Aqui NO se llama a skipWaiting: el service worker nuevo se queda esperando a proposito.
    // Esa espera es lo que la pagina detecta para sacar la ventana de "hay una version nueva".
    // Solo se adelanta cuando la persona pulsa el boton (mensaje SKIP_WAITING de abajo).
});

// La pagina pide el relevo cuando la persona pulsa "Actualizar". Sin ese boton, no pasa nada.
self.addEventListener('message', ev => {
    if (ev.data && ev.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', ev => {
    ev.waitUntil(
        caches.keys()
            .then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', ev => {
    const req = ev.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;   // USGS, EMSC, mapas: siempre red, sin tocar

    // La pagina: primero la red (para recibir mejoras), la cache solo si no hay conexion.
    if (req.mode === 'navigate') {
        ev.respondWith(
            fetch(req)
                .then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', cp)); return r; })
                .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
        );
        return;
    }

    // Iconos y manifiesto: de la cache, y se refrescan por detras.
    ev.respondWith(
        caches.match(req).then(hit => {
            const red = fetch(req).then(r => {
                if (r && r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
                return r;
            }).catch(() => hit);
            return hit || red;
        })
    );
});

// Al tocar el aviso, traer al frente la pestana ya abierta en vez de abrir otra.
self.addEventListener('notificationclick', ev => {
    ev.notification.close();
    ev.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ls => {
            for (const c of ls) { if ('focus' in c) return c.focus(); }
            if (self.clients.openWindow) return self.clients.openWindow('./');
        })
    );
});
