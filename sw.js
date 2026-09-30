// Service worker de Cartoon Instructeur :
// 1. l'appli s'ouvre même avec un réseau faible ou absent (dernière version gardée en cache),
//    tout en restant toujours à jour quand le réseau répond (réseau d'abord, cache en secours) ;
// 2. notifications (génération terminée, vidéo publiée).
const CACHE = 'cartoon-app-v17';
const NETWORK_TIMEOUT_MS = 4000;
const APP_FILES = ['./', './index.html', './css/app.css', './js/core.js', './js/motion.js', './js/voices.js', './js/scenes.js', './js/claude.js', './js/settings.js', './js/media.js', './js/generation.js', './js/render.js', './js/montage.js', './js/exports.js', './js/studio.js', './js/growth.js', './js/navigation.js', './js/projects.js', './js/integrations.js', './js/compositor.js', './js/quality.js', './js/graphics.js', './js/channel.js', './js/puppet.js', './js/director.js', './js/init.js', './data/icons.json', './data/emoji3d.json'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // seulement les fichiers de l'appli (et les polices) : jamais les API ni les vidéos
    const own = url.origin === self.location.origin;
    const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
    if (!own && !fonts) return;
    if (own && !/\.(html|js|css|json|png|svg|ico)$|\/$/.test(url.pathname)) return;
    e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const network = fetch(req, own ? { cache: 'no-cache' } : undefined).then(res => { if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone()); return res; });
        if (fonts) { const hit = await cache.match(req); if (hit) { network.catch(() => {}); return hit; } return network; }
        try {
            return await Promise.race([network, new Promise((_, rej) => setTimeout(() => rej(new Error('lent')), NETWORK_TIMEOUT_MS))]);
        } catch (err) {
            const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
            if (hit) { network.catch(() => {}); return hit; }
            return network;
        }
    })());
});
self.addEventListener('push', e => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {}
    e.waitUntil(self.registration.showNotification(data.title || 'Cartoon Instructeur', {
        body: data.body || '✅ C\'est prêt : génération terminée ou vidéo publiée. Ouvre l\'appli pour voir.',
        tag: 'cartoon-job'
    }));
});
self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => ws.length ? ws[0].focus() : self.clients.openWindow('./')));
});
