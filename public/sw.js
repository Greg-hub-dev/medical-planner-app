// public/sw.js - Service Worker pour notifications push
// À placer dans le dossier public/ de votre projet Next.js

const CACHE_NAME = 'medical-planner-v1';
const urlsToCache = [
  '/',
  '/icon-192.png',
  '/icon-512.png'
];

// Installation du service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Activation du service worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Gestion des notifications push
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nouvelle notification du Planning Médical',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    },
    actions: [
      {
        action: 'explore',
        title: '📅 Voir planning',
        icon: '/icon-192.png'
      },
      {
        action: 'close',
        title: '✖️ Fermer',
        icon: '/icon-192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('📚 Planning Médical', options)
  );
});

// Gestion des clics sur notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    // Ouvrir l'application
    event.waitUntil(
      clients.openWindow('/')
    );
  } else if (event.action === 'close') {
    // Fermer la notification (déjà fait ci-dessus)
  } else {
    // Clic général sur la notification
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Gestion des messages du client principal
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay, sessionId } = event.data;

    setTimeout(() => {
      self.registration.showNotification(title, {
        body: body,
        icon: '/icon-192.png',
        badge: '/icon-72.png',
        tag: `session-${sessionId}`,
        requireInteraction: true,
        data: { sessionId },
        actions: [
          { action: 'mark-done', title: '✅ Fait' },
          { action: 'reschedule', title: '🔄 Reporter' }
        ]
      });
    }, delay);
  }
});

// Mise en cache des requêtes (optionnel)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retourner la réponse en cache si disponible
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});
