/**
 * Las Sazones de Anita — interacciones del sitio.
 *
 * Notas de seguridad:
 * - No se usa innerHTML ni eval: todo el texto se inserta con textContent.
 * - Los datos del formulario se limpian y se codifican antes de usarse.
 * - El envío se limita por tiempo para frenar abuso (protección básica;
 *   la protección real contra fuerza bruta debe hacerse en el servidor).
 */
(function () {
    'use strict';

    var WHATSAPP_NUMERO = '56942723764';
    var CLAVE_ENVIOS = 'lsa_envios';
    var INTERVALO_MS = 30 * 1000;          // 30 s entre mensajes
    var VENTANA_MS = 10 * 60 * 1000;       // ventana de 10 minutos
    var MAX_ENVIOS = 5;                    // máximo 5 mensajes por ventana
    var LIMITE_NOMBRE = 60;
    var LIMITE_MENSAJE = 500;

    var reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Almacenamiento seguro: localStorage puede fallar en modo privado. */
    var almacen = {
        get: function (clave) {
            try { return window.localStorage.getItem(clave); } catch (e) { return null; }
        },
        set: function (clave, valor) {
            try { window.localStorage.setItem(clave, valor); } catch (e) { /* sin persistencia */ }
        }
    };

    function $(selector, contexto) {
        return (contexto || document).querySelector(selector);
    }

    function $$(selector, contexto) {
        return Array.prototype.slice.call((contexto || document).querySelectorAll(selector));
    }

    /* Limpia texto: quita etiquetas y normaliza espacios. */
    function normalizar(valor) {
        return String(valor || '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ============================================================
       1. Enlace de navegación activo según la sección visible
       ============================================================ */
    function iniciarNavegacionActiva() {
        var enlaces = $$('header .nav-links a[href^="#"]');
        var pares = enlaces
            .map(function (enlace) {
                var destino = document.getElementById(enlace.getAttribute('href').slice(1));
                return destino ? { enlace: enlace, seccion: destino } : null;
            })
            .filter(Boolean);

        if (!pares.length || !('IntersectionObserver' in window)) {
            return;
        }

        var observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) {
                    return;
                }
                pares.forEach(function (par) {
                    par.enlace.classList.toggle('activo', par.seccion === entrada.target);
                });
            });
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

        pares.forEach(function (par) { observador.observe(par.seccion); });

        /* Estado inicial: resalta el primer enlace hasta que el scroll lo actualice. */
        var hayActivo = pares.some(function (par) {
            return par.enlace.classList.contains('activo');
        });
        if (!hayActivo) {
            pares[0].enlace.classList.add('activo');
        }
    }

    /* ============================================================
       2. Aparición suave de tarjetas y secciones
       ============================================================ */
    function iniciarRevelado() {
        if (reducirMovimiento || !('IntersectionObserver' in window)) {
            return;
        }

        var elementos = $$('.plato, #inicio img, #menu h3, .tarjeta-contacto, .formulario-contacto');
        if (!elementos.length) {
            return;
        }

        elementos.forEach(function (el) { el.classList.add('revelar'); });

        var observador = new IntersectionObserver(function (entradas, obs) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) {
                    return;
                }
                entrada.target.classList.add('visible');
                obs.unobserve(entrada.target);
            });
        }, { threshold: 0.12 });

        elementos.forEach(function (el) { observador.observe(el); });
    }

    /* ============================================================
       3. Botón "volver arriba"
       ============================================================ */
    function iniciarBotonArriba() {
        var boton = $('#volver-arriba');
        if (!boton) {
            return;
        }

        var temporizador = null;

        function actualizar() {
            if (window.scrollY > 500) {
                window.clearTimeout(temporizador);
                boton.hidden = false;
                window.requestAnimationFrame(function () {
                    boton.classList.add('visible');
                });
            } else {
                boton.classList.remove('visible');
                temporizador = window.setTimeout(function () {
                    boton.hidden = true;
                }, 300);
            }
        }

        window.addEventListener('scroll', actualizar, { passive: true });

        boton.addEventListener('click', function () {
            window.scrollTo({
                top: 0,
                behavior: reducirMovimiento ? 'auto' : 'smooth'
            });
        });

        actualizar();
    }

    /* ============================================================
       4. Formulario de contacto (envía a WhatsApp)
       ============================================================ */
    function iniciarFormulario() {
        var formulario = $('#formulario-contacto');
        if (!formulario) {
            return;
        }

        var campoNombre = $('#nombre', formulario);
        var campoMensaje = $('#mensaje', formulario);
        var campoEmpresa = $('#empresa', formulario);
        var boton = $('.boton-enviar', formulario);
        var salida = $('#form-mensaje', formulario);
        var textoBoton = boton ? boton.textContent : 'Enviar por WhatsApp';
        var intervaloEspera = null;

        function mostrarMensaje(texto, tipo) {
            if (!salida) {
                return;
            }
            salida.textContent = texto;
            salida.dataset.tipo = tipo || 'info';
        }

        function leerEnvios() {
            try {
                var datos = JSON.parse(almacen.get(CLAVE_ENVIOS) || '[]');
                if (!Array.isArray(datos)) {
                    return [];
                }
                return datos.filter(function (marca) {
                    return typeof marca === 'number' && marca > 0;
                });
            } catch (e) {
                return [];
            }
        }

        function guardarEnvios(lista) {
            almacen.set(CLAVE_ENVIOS, JSON.stringify(lista));
        }

        function estadoLimite() {
            var ahora = Date.now();
            var envios = leerEnvios().filter(function (marca) {
                return ahora - marca < VENTANA_MS;
            });

            if (envios.length >= MAX_ENVIOS) {
                var esperaMax = Math.ceil((VENTANA_MS - (ahora - envios[0])) / 1000);
                return { bloqueado: true, espera: esperaMax, motivo: 'maximo' };
            }

            var ultimo = envios.length ? envios[envios.length - 1] : 0;
            var restante = INTERVALO_MS - (ahora - ultimo);
            if (restante > 0) {
                return { bloqueado: true, espera: Math.ceil(restante / 1000), motivo: 'intervalo' };
            }

            return { bloqueado: false, espera: 0, motivo: '' };
        }

        function iniciarEspera(segundos) {
            if (!boton) {
                return;
            }

            if (intervaloEspera) {
                window.clearInterval(intervaloEspera);
            }

            var restantes = Math.max(1, Math.ceil(segundos));
            boton.disabled = true;
            boton.textContent = 'Espera ' + restantes + ' s…';

            intervaloEspera = window.setInterval(function () {
                restantes -= 1;
                if (restantes <= 0) {
                    window.clearInterval(intervaloEspera);
                    intervaloEspera = null;
                    boton.disabled = false;
                    boton.textContent = textoBoton;
                } else {
                    boton.textContent = 'Espera ' + restantes + ' s…';
                }
            }, 1000);
        }

        function marcarError(campo, mensaje) {
            mostrarMensaje(mensaje, 'error');
            if (campo) {
                campo.setAttribute('aria-invalid', 'true');
                campo.focus();
            }
        }

        [campoNombre, campoMensaje].forEach(function (campo) {
            if (!campo) {
                return;
            }
            campo.addEventListener('input', function () {
                campo.removeAttribute('aria-invalid');
            });
        });

        formulario.addEventListener('submit', function (evento) {
            evento.preventDefault();

            /* Trampa anti-bots: si el campo oculto tiene texto, se descarta. */
            if (campoEmpresa && campoEmpresa.value.trim() !== '') {
                formulario.reset();
                mostrarMensaje('No se pudo enviar el mensaje. Inténtalo de nuevo.', 'error');
                return;
            }

            var nombre = normalizar(campoNombre ? campoNombre.value : '').slice(0, LIMITE_NOMBRE);
            var mensaje = normalizar(campoMensaje ? campoMensaje.value : '').slice(0, LIMITE_MENSAJE);

            if (nombre.length < 2) {
                marcarError(campoNombre, 'Escribe tu nombre (mínimo 2 caracteres).');
                return;
            }

            if (mensaje.length < 10) {
                marcarError(campoMensaje, 'Cuéntanos un poco más (mínimo 10 caracteres).');
                return;
            }

            var limite = estadoLimite();
            if (limite.bloqueado) {
                if (limite.motivo === 'maximo') {
                    mostrarMensaje('Demasiados mensajes seguidos. Inténtalo más tarde.', 'error');
                } else {
                    mostrarMensaje('Por seguridad, espera ' + limite.espera + ' segundos antes de enviar otro mensaje.', 'error');
                }
                iniciarEspera(Math.min(limite.espera, 600));
                return;
            }

            /* encodeURIComponent evita inyección de parámetros en la URL. */
            var texto = 'Hola, soy ' + nombre + '. ' + mensaje;
            var url = 'https://wa.me/' + WHATSAPP_NUMERO + '?text=' + encodeURIComponent(texto);

            var enlace = document.createElement('a');
            enlace.href = url;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            var envios = leerEnvios().filter(function (marca) {
                return Date.now() - marca < VENTANA_MS;
            });
            envios.push(Date.now());
            guardarEnvios(envios);

            formulario.reset();
            campoNombre && campoNombre.removeAttribute('aria-invalid');
            campoMensaje && campoMensaje.removeAttribute('aria-invalid');
            mostrarMensaje('¡Listo! Se abrió WhatsApp para completar el envío.', 'ok');
            iniciarEspera(Math.ceil(INTERVALO_MS / 1000));
        });

        var limiteInicial = estadoLimite();
        if (limiteInicial.bloqueado) {
            iniciarEspera(Math.min(limiteInicial.espera, 600));
        }
    }

    /* ============================================================
       Arranque
       ============================================================ */
    iniciarNavegacionActiva();
    iniciarRevelado();
    iniciarBotonArriba();
    iniciarFormulario();
})();
