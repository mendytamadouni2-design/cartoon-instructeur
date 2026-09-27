// Service worker de Cartoon Instructeur : uniquement pour les notifications.
// (Pas de mise en cache : l'appli se charge toujours à jour.)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
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
