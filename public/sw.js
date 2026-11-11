// Service worker mínimo: hace que la app sea instalable y muestra una pantalla
// clara cuando no hay conexión. A propósito NO guarda páginas ni datos: es
// información privada y tiene que venir siempre al día desde el servidor.
const CACHE = "julian-os-v1";
const SIN_CONEXION = "/sin-conexion";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SIN_CONEXION, "/iconos/icono-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match(SIN_CONEXION)));
});
