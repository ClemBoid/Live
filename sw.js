const CACHE_NAME = 'live-v7';
const APP_SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './badge-96.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(APP_SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => clients.claim())
    );
});

self.addEventListener('push', (event) => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch(e) { payload = { title: 'Live!', body: event.data ? event.data.text() : '' }; }
    const title = payload.title || '🎸 Concert demain !';
    const options = {
        body: payload.body || '',
        icon: './icon-192.png',
        badge: './badge-96.png',
        tag: payload.tag || 'live-reminder',
        data: { url: payload.url || './' },
        vibrate: [120, 60, 120]
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const brut = (event.notification.data && event.notification.data.url) || './';
    const url = new URL(brut, self.registration.scope).href;
    const avecLien = url !== new URL('./', self.registration.scope).href;
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async list => {
            for (const c of list) {
                if (!('focus' in c)) continue;
                const fenetre = await c.focus();
                // Ouvre la fiche ou l'écran visé par la notification
                if (avecLien && fenetre && 'navigate' in fenetre) { try { await fenetre.navigate(url); } catch (e) {} }
                return;
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') { event.respondWith(fetch(req)); return; }
    const url = new URL(req.url);
    // Ne jamais mettre en cache les appels Supabase / Spotify / tuiles carte — toujours réseau d'abord
    if (url.hostname.includes('supabase.co') || url.hostname.includes('spotify.com') || url.hostname.includes('basemaps.cartocdn.com')) {
        event.respondWith(fetch(req).catch(() => caches.match(req)));
        return;
    }
    // Pages HTML : réseau d'abord (pour toujours avoir la dernière version), cache en secours hors ligne
    if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
        event.respondWith(
            fetch(req).then(resp => {
                if (resp && resp.status === 200 && url.origin === self.location.origin) { const clone = resp.clone(); caches.open(CACHE_NAME).then(c => c.put(req, clone)); }
                return resp;
            }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
        );
        return;
    }
    // Autres fichiers de l'appli : cache-first avec mise à jour en arrière-plan
    event.respondWith(
        caches.match(req).then(cached => {
            const fetchPromise = fetch(req).then(resp => {
                if (resp && resp.status === 200 && (url.origin === self.location.origin)) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
