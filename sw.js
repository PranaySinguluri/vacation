/* Retire the old offline helper without deleting caches owned by other apps on this origin. */
const APP_CACHE_PREFIXES = ['tripwallet-', 'trip-wallet-', 'vacation-'];
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => APP_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))).map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((tabs) => Promise.all(tabs.map((tab) => tab.navigate(tab.url))))
  );
});
