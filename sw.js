/*
 * Service worker de Las Sazones de Anita.
 *
 * Estrategia:
 * - Instalación: guarda en caché el HTML, CSS, JS, iconos e imágenes del menú.
 * - Navegación: red primero; si no hay internet, sirve index.html desde caché.
 * - Recursos propios: caché primero, luego red (y se actualiza la caché).
 * - Google Fonts: caché primero con actualización en segundo plano.
 *
 * Al cambiar el contenido, sube la versión de CACHE_NAME para limpiar la anterior.
 */
'use strict';

var CACHE_NAME = 'lsa-v3';

var CORE_ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/main.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-512.png',
    './icons/apple-touch-icon.png',
    './Imagen de comida colombiana.png',
    './Imagen de comida chilena.png',
    './imagen de background.png',
    './Imagen de papa rellena.png',
    './Platano Aborrajado.png',
    './Bandeja paisa.png',
    './Sancocho de gallina.png',
    './Empanadas de pino.png',
    './Chorrillana.png',
    './Pastel de choclo.png',
    './Carbonada.png'
];

/* ---------- Instalación ---------- */
self.addEventListener('install', function (evento) {
    evento.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) {
                return cache.addAll(CORE_ASSETS);
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

/* ---------- Activación ---------- */
self.addEventListener('activate', function (evento) {
    evento.waitUntil(
        caches.keys()
            .then(function (claves) {
                return Promise.all(
                    claves
                        .filter(function (clave) { return clave !== CACHE_NAME; })
                        .map(function (clave) { return caches.delete(clave); })
                );
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

/* ---------- Fetch ---------- */
self.addEventListener('fetch', function (evento) {
    var peticion = evento.request;

    if (peticion.method !== 'GET') {
        return;
    }

    var url = new URL(peticion.url);
    var esMismoOrigen = url.origin === self.location.origin;
    var esFuente = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

    if (!esMismoOrigen && !esFuente) {
        return;
    }

    /* Navegación: red primero y, si falla, index.html en caché. */
    if (peticion.mode === 'navigate') {
        evento.respondWith(
            fetch(peticion).catch(function () {
                return caches.match('./index.html').then(function (respuesta) {
                    return respuesta || caches.match('./');
                });
            })
        );
        return;
    }

    /* Google Fonts: caché primero, actualización en segundo plano. */
    if (esFuente) {
        evento.respondWith(
            caches.match(peticion).then(function (enCache) {
                var red = fetch(peticion).then(function (respuesta) {
                    if (respuesta && respuesta.status === 200) {
                        var copia = respuesta.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(peticion, copia);
                        });
                    }
                    return respuesta;
                }).catch(function () {
                    return enCache;
                });

                return enCache || red;
            })
        );
        return;
    }

    /* Recursos propios: caché primero y, si no está, red. */
    evento.respondWith(
        caches.match(peticion).then(function (enCache) {
            if (enCache) {
                return enCache;
            }

            return fetch(peticion).then(function (respuesta) {
                if (!respuesta || respuesta.status !== 200 || respuesta.type === 'opaque') {
                    return respuesta;
                }

                var copia = respuesta.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(peticion, copia);
                });

                return respuesta;
            });
        })
    );
});
