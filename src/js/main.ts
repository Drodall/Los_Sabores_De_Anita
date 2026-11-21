/**
 * Las Sazones de Anita — interacciones del sitio.
 *
 * Notas de seguridad:
 * - No se usa innerHTML ni eval: todo el texto se inserta con textContent.
 * - Los datos del formulario se limpian y se codifican antes de usarse.
 * - El envío se limita por tiempo para frenar abuso (protección básica;
 *   la protección real contra fuerza bruta debe hacerse en el servidor).
 *
 * Compilar con `npm run build:js` (genera js/main.js).
 */
(() => {
    'use strict';

    const WHATSAPP_NUMERO = '56942723764';
    const CLAVE_ENVIOS = 'lsa_envios';
    const INTERVALO_MS = 30 * 1000;          // 30 s entre mensajes
    const VENTANA_MS = 10 * 60 * 1000;       // ventana de 10 minutos
    const MAX_ENVIOS = 5;                    // máximo 5 mensajes por ventana
    const LIMITE_NOMBRE = 60;
    const LIMITE_MENSAJE = 500;

    const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    interface AlmacenSeguro {
        get(clave: string): string | null;
        set(clave: string, valor: string): void;
    }

    /* Almacenamiento seguro: localStorage puede fallar en modo privado. */
    const almacen: AlmacenSeguro = {
        get(clave) {
            try {
                return window.localStorage.getItem(clave);
            } catch {
                return null;
            }
        },
        set(clave, valor) {
            try {
                window.localStorage.setItem(clave, valor);
            } catch {
                /* sin persistencia */
            }
        }
    };

    function $<T extends Element>(selector: string, contexto: ParentNode = document): T | null {
        return contexto.querySelector<T>(selector);
    }

    function $$<T extends Element>(selector: string, contexto: ParentNode = document): T[] {
        return Array.from(contexto.querySelectorAll<T>(selector));
    }

    /* Limpia texto: quita etiquetas y normaliza espacios. */
    function normalizar(valor: unknown): string {
        return String(valor ?? '')
            .replace(/[<>]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ============================================================
       1. Enlace de navegación activo según la sección visible
       ============================================================ */
    interface ParNavegacion {
        enlace: HTMLAnchorElement;
        seccion: HTMLElement;
    }

    function iniciarNavegacionActiva(): void {
        const enlaces = $$<HTMLAnchorElement>('header .nav-links a[href^="#"]');
        const pares: ParNavegacion[] = [];

        for (const enlace of enlaces) {
            const href = enlace.getAttribute('href');
            if (!href) {
                continue;
            }

            const destino = document.getElementById(href.slice(1));
            if (destino) {
                pares.push({ enlace, seccion: destino });
            }
        }

        if (pares.length === 0 || !('IntersectionObserver' in window)) {
            return;
        }

        const observador = new IntersectionObserver((entradas) => {
            for (const entrada of entradas) {
                if (!entrada.isIntersecting) {
                    continue;
                }

                for (const par of pares) {
                    par.enlace.classList.toggle('activo', par.seccion === entrada.target);
                }
            }
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

        for (const par of pares) {
            observador.observe(par.seccion);
        }

        /* Estado inicial: resalta el primer enlace hasta que el scroll lo actualice. */
        const hayActivo = pares.some((par) => par.enlace.classList.contains('activo'));
        if (!hayActivo) {
            const primero = pares[0];
            if (primero) {
                primero.enlace.classList.add('activo');
            }
        }
    }

    /* ============================================================
       2. Aparición suave de tarjetas y secciones
       ============================================================ */
    function iniciarRevelado(): void {
        if (reducirMovimiento || !('IntersectionObserver' in window)) {
            return;
        }

        const elementos = $$('.plato, #inicio img, #menu h3, .tarjeta-contacto, .formulario-contacto');
        if (elementos.length === 0) {
            return;
        }

        for (const elemento of elementos) {
            elemento.classList.add('revelar');
        }

        const observador = new IntersectionObserver((entradas, obs) => {
            for (const entrada of entradas) {
                if (!entrada.isIntersecting) {
                    continue;
                }

                entrada.target.classList.add('visible');
                obs.unobserve(entrada.target);
            }
        }, { threshold: 0.12 });

        for (const elemento of elementos) {
            observador.observe(elemento);
        }
    }

    /* ============================================================
       3. Botón "volver arriba"
       ============================================================ */
    function iniciarBotonArriba(): void {
        const botonEncontrado = $<HTMLButtonElement>('#volver-arriba');
        if (!botonEncontrado) {
            return;
        }

        /* Copia no nula: el narrowing no se conserva dentro de una función
           declarada, así que se fija el tipo antes de crear los callbacks. */
        const boton: HTMLButtonElement = botonEncontrado;
        let temporizador: number | null = null;

        function actualizar(): void {
            if (window.scrollY > 500) {
                if (temporizador !== null) {
                    window.clearTimeout(temporizador);
                    temporizador = null;
                }

                boton.hidden = false;
                window.requestAnimationFrame(() => {
                    boton.classList.add('visible');
                });
            } else {
                boton.classList.remove('visible');
                temporizador = window.setTimeout(() => {
                    boton.hidden = true;
                }, 300);
            }
        }

        window.addEventListener('scroll', actualizar, { passive: true });

        boton.addEventListener('click', () => {
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
    type CampoTexto = HTMLInputElement | HTMLTextAreaElement;
    type TipoMensaje = 'info' | 'error' | 'ok';
    type MotivoLimite = '' | 'maximo' | 'intervalo';

    interface EstadoLimite {
        bloqueado: boolean;
        espera: number;
        motivo: MotivoLimite;
    }

    function iniciarFormulario(): void {
        const formulario = $<HTMLFormElement>('#formulario-contacto');
        if (!formulario) {
            return;
        }

        const campoNombre = $<HTMLInputElement>('#nombre', formulario);
        const campoMensaje = $<HTMLTextAreaElement>('#mensaje', formulario);
        const campoEmpresa = $<HTMLInputElement>('#empresa', formulario);
        const boton = $<HTMLButtonElement>('.boton-enviar', formulario);
        const salida = $<HTMLParagraphElement>('#form-mensaje', formulario);
        const textoBoton = boton?.textContent ?? 'Enviar por WhatsApp';
        let intervaloEspera: number | null = null;

        function mostrarMensaje(texto: string, tipo: TipoMensaje = 'info'): void {
            if (!salida) {
                return;
            }

            salida.textContent = texto;
            salida.dataset.tipo = tipo;
        }

        function leerEnvios(): number[] {
            try {
                const datos: unknown = JSON.parse(almacen.get(CLAVE_ENVIOS) ?? '[]');
                if (!Array.isArray(datos)) {
                    return [];
                }

                return datos.filter((marca: unknown): marca is number => (
                    typeof marca === 'number' && marca > 0
                ));
            } catch {
                return [];
            }
        }

        function guardarEnvios(lista: number[]): void {
            almacen.set(CLAVE_ENVIOS, JSON.stringify(lista));
        }

        function estadoLimite(): EstadoLimite {
            const ahora = Date.now();
            const envios = leerEnvios().filter((marca) => ahora - marca < VENTANA_MS);

            if (envios.length >= MAX_ENVIOS) {
                const esperaMax = Math.ceil((VENTANA_MS - (ahora - envios[0])) / 1000);
                return { bloqueado: true, espera: esperaMax, motivo: 'maximo' };
            }

            const ultimo = envios.length ? envios[envios.length - 1] : 0;
            const restante = INTERVALO_MS - (ahora - ultimo);
            if (restante > 0) {
                return { bloqueado: true, espera: Math.ceil(restante / 1000), motivo: 'intervalo' };
            }

            return { bloqueado: false, espera: 0, motivo: '' };
        }

        function iniciarEspera(segundos: number): void {
            if (!boton) {
                return;
            }

            if (intervaloEspera !== null) {
                window.clearInterval(intervaloEspera);
                intervaloEspera = null;
            }

            let restantes = Math.max(1, Math.ceil(segundos));
            boton.disabled = true;
            boton.textContent = `Espera ${restantes} s…`;

            intervaloEspera = window.setInterval(() => {
                restantes -= 1;
                if (restantes <= 0) {
                    if (intervaloEspera !== null) {
                        window.clearInterval(intervaloEspera);
                        intervaloEspera = null;
                    }

                    boton.disabled = false;
                    boton.textContent = textoBoton;
                } else {
                    boton.textContent = `Espera ${restantes} s…`;
                }
            }, 1000);
        }

        function marcarError(campo: CampoTexto | null, mensaje: string): void {
            mostrarMensaje(mensaje, 'error');
            if (campo) {
                campo.setAttribute('aria-invalid', 'true');
                campo.focus();
            }
        }

        for (const campo of [campoNombre, campoMensaje]) {
            if (!campo) {
                continue;
            }

            campo.addEventListener('input', () => {
                campo.removeAttribute('aria-invalid');
            });
        }

        formulario.addEventListener('submit', (evento) => {
            evento.preventDefault();

            /* Trampa anti-bots: si el campo oculto tiene texto, se descarta. */
            if (campoEmpresa && campoEmpresa.value.trim() !== '') {
                formulario.reset();
                mostrarMensaje('No se pudo enviar el mensaje. Inténtalo de nuevo.', 'error');
                return;
            }

            const nombre = normalizar(campoNombre ? campoNombre.value : '').slice(0, LIMITE_NOMBRE);
            const mensaje = normalizar(campoMensaje ? campoMensaje.value : '').slice(0, LIMITE_MENSAJE);

            if (nombre.length < 2) {
                marcarError(campoNombre, 'Escribe tu nombre (mínimo 2 caracteres).');
                return;
            }

            if (mensaje.length < 10) {
                marcarError(campoMensaje, 'Cuéntanos un poco más (mínimo 10 caracteres).');
                return;
            }

            const limite = estadoLimite();
            if (limite.bloqueado) {
                if (limite.motivo === 'maximo') {
                    mostrarMensaje('Demasiados mensajes seguidos. Inténtalo más tarde.', 'error');
                } else {
                    mostrarMensaje(`Por seguridad, espera ${limite.espera} segundos antes de enviar otro mensaje.`, 'error');
                }

                iniciarEspera(Math.min(limite.espera, 600));
                return;
            }

            /* encodeURIComponent evita inyección de parámetros en la URL. */
            const texto = `Hola, soy ${nombre}. ${mensaje}`;
            const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`;

            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            const envios = leerEnvios().filter((marca) => Date.now() - marca < VENTANA_MS);
            envios.push(Date.now());
            guardarEnvios(envios);

            formulario.reset();
            campoNombre?.removeAttribute('aria-invalid');
            campoMensaje?.removeAttribute('aria-invalid');
            mostrarMensaje('¡Listo! Se abrió WhatsApp para completar el envío.', 'ok');
            iniciarEspera(Math.ceil(INTERVALO_MS / 1000));
        });

        const limiteInicial = estadoLimite();
        if (limiteInicial.bloqueado) {
            iniciarEspera(Math.min(limiteInicial.espera, 600));
        }
    }

    /* ============================================================
       5. Carrito de pedidos (localStorage + WhatsApp)
       ============================================================ */
    interface ItemCarrito {
        id: string;
        nombre: string;
        precio: number;
        cantidad: number;
    }

    const CLAVE_CARRITO = 'lsa_carrito';
    const MAX_CANTIDAD = 20;

    function formatearPrecio(valor: number): string {
        return '$CLP' + Math.round(valor).toLocaleString('es-CL');
    }

    function leerCarrito(): ItemCarrito[] {
        try {
            const datos: unknown = JSON.parse(almacen.get(CLAVE_CARRITO) ?? '[]');
            if (!Array.isArray(datos)) {
                return [];
            }

            const items: ItemCarrito[] = [];
            for (const dato of datos) {
                if (typeof dato !== 'object' || dato === null) {
                    continue;
                }

                const registro = dato as Record<string, unknown>;
                const { id, nombre, precio, cantidad } = registro;

                if (typeof id !== 'string' || typeof nombre !== 'string') {
                    continue;
                }
                if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) {
                    continue;
                }
                if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) {
                    continue;
                }

                items.push({
                    id,
                    nombre,
                    precio,
                    cantidad: Math.min(cantidad, MAX_CANTIDAD)
                });
            }

            return items;
        } catch {
            return [];
        }
    }

    function guardarCarrito(items: ItemCarrito[]): void {
        almacen.set(CLAVE_CARRITO, JSON.stringify(items));
    }

    function iniciarCarrito(): void {
        const panel = $<HTMLElement>('#carrito-panel');
        const overlay = $<HTMLElement>('#carrito-overlay');
        const disparador = $<HTMLButtonElement>('#abrir-carrito');
        const contenedor = $<HTMLElement>('#carrito-items');
        const salidaTotal = $<HTMLElement>('#carrito-total');
        const salidaContador = $<HTMLElement>('#carrito-contador');
        const botonCheckout = $<HTMLButtonElement>('#carrito-checkout');
        const botonVaciar = $<HTMLButtonElement>('#carrito-vaciar');
        const salidaMensaje = $<HTMLElement>('#carrito-mensaje');
        const aviso = $<HTMLElement>('#carrito-aviso');

        if (!panel || !overlay || !contenedor || !salidaTotal || !salidaContador) {
            return;
        }

        const panelEl: HTMLElement = panel;
        const overlayEl: HTMLElement = overlay;
        const contenedorEl: HTMLElement = contenedor;
        const totalEl: HTMLElement = salidaTotal;
        const contadorEl: HTMLElement = salidaContador;

        function anunciar(texto: string): void {
            if (aviso) {
                aviso.textContent = texto;
            }
        }

        function mostrarMensaje(texto: string, tipo: 'ok' | 'error' | 'info'): void {
            if (!salidaMensaje) {
                return;
            }

            salidaMensaje.textContent = texto;
            salidaMensaje.dataset.tipo = tipo;
        }

        function crearBotonCantidad(texto: string, accion: string, id: string, etiqueta: string): HTMLButtonElement {
            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cream text-base leading-none text-ink transition hover:bg-cream';
            boton.textContent = texto;
            boton.dataset.accion = accion;
            boton.dataset.id = id;
            boton.setAttribute('aria-label', etiqueta);
            return boton;
        }

        function crearFila(item: ItemCarrito): HTMLElement {
            const fila = document.createElement('div');
            fila.className = 'flex items-start gap-3 border-b border-cream py-4 last:border-b-0';

            const info = document.createElement('div');
            info.className = 'min-w-0 flex-1';

            const nombre = document.createElement('p');
            nombre.className = 'm-0 font-semibold text-ink';
            nombre.textContent = item.nombre;

            const unitario = document.createElement('p');
            unitario.className = 'm-0 text-sm text-ink/70';
            unitario.textContent = formatearPrecio(item.precio) + ' c/u';

            const subtotal = document.createElement('p');
            subtotal.className = 'm-0 mt-1 text-sm font-bold text-brand';
            subtotal.textContent = formatearPrecio(item.precio * item.cantidad);

            info.append(nombre, unitario, subtotal);

            const cantidad = document.createElement('span');
            cantidad.className = 'min-w-6 text-center text-sm font-bold text-ink';
            cantidad.textContent = String(item.cantidad);

            const controles = document.createElement('div');
            controles.className = 'flex items-center gap-1';
            controles.append(
                crearBotonCantidad('−', 'restar', item.id, 'Quitar una unidad'),
                cantidad,
                crearBotonCantidad('+', 'sumar', item.id, 'Agregar una unidad'),
                crearBotonCantidad('×', 'quitar', item.id, 'Eliminar del pedido')
            );

            fila.append(info, controles);
            return fila;
        }

        function render(): void {
            const items = leerCarrito();
            contenedorEl.replaceChildren();

            if (items.length === 0) {
                const vacio = document.createElement('p');
                vacio.className = 'm-0 py-12 text-center text-sm text-ink/70';
                vacio.textContent = 'Tu pedido está vacío. Agregá platos desde el menú.';
                contenedorEl.appendChild(vacio);
            } else {
                for (const item of items) {
                    contenedorEl.appendChild(crearFila(item));
                }
            }

            const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
            const unidades = items.reduce((suma, item) => suma + item.cantidad, 0);

            totalEl.textContent = formatearPrecio(total);
            contadorEl.textContent = String(unidades);
            contadorEl.hidden = unidades === 0;

            if (botonCheckout) {
                botonCheckout.disabled = items.length === 0;
            }
            if (botonVaciar) {
                botonVaciar.disabled = items.length === 0;
            }
        }

        function abrirPanel(): void {
            panelEl.classList.remove('hidden');
            panelEl.classList.add('flex');
            panelEl.setAttribute('aria-hidden', 'false');
            overlayEl.classList.remove('hidden');
            document.body.classList.add('carrito-abierto');

            if (disparador) {
                disparador.setAttribute('aria-expanded', 'true');
            }

            const cerrar = panelEl.querySelector<HTMLButtonElement>('[data-cerrar-carrito]');
            cerrar?.focus();
        }

        function cerrarPanel(): void {
            panelEl.classList.add('hidden');
            panelEl.classList.remove('flex');
            panelEl.setAttribute('aria-hidden', 'true');
            overlayEl.classList.add('hidden');
            document.body.classList.remove('carrito-abierto');

            if (disparador) {
                disparador.setAttribute('aria-expanded', 'false');
                disparador.focus();
            }
        }

        function agregar(id: string, nombre: string, precio: number): void {
            const items = leerCarrito();
            const existente = items.find((item) => item.id === id);

            if (existente) {
                existente.cantidad = Math.min(existente.cantidad + 1, MAX_CANTIDAD);
            } else {
                items.push({ id, nombre, precio, cantidad: 1 });
            }

            guardarCarrito(items);
            render();
            anunciar(`${nombre} agregado al pedido.`);
        }

        function cambiarCantidad(id: string, accion: string): void {
            const items = leerCarrito();
            const indice = items.findIndex((item) => item.id === id);
            const item = items[indice];

            if (!item) {
                return;
            }

            if (accion === 'sumar') {
                item.cantidad = Math.min(item.cantidad + 1, MAX_CANTIDAD);
            } else if (accion === 'restar') {
                item.cantidad -= 1;
            } else if (accion === 'quitar') {
                item.cantidad = 0;
            }

            if (item.cantidad <= 0) {
                items.splice(indice, 1);
            }

            guardarCarrito(items);
            render();
        }

        disparador?.addEventListener('click', abrirPanel);
        overlayEl.addEventListener('click', cerrarPanel);

        document.addEventListener('click', (evento) => {
            const objetivo = evento.target;
            if (!(objetivo instanceof Element)) {
                return;
            }

            if (objetivo.closest('[data-cerrar-carrito]')) {
                cerrarPanel();
                return;
            }

            const botonAgregar = objetivo.closest<HTMLElement>('[data-agregar]');
            if (!botonAgregar) {
                return;
            }

            const plato = botonAgregar.closest<HTMLElement>('.plato');
            if (!plato) {
                return;
            }

            const id = plato.dataset.id;
            const nombre = plato.dataset.nombre;
            const precio = Number(plato.dataset.precio);

            if (!id || !nombre || !Number.isFinite(precio) || precio <= 0) {
                return;
            }

            agregar(id, nombre, precio);
        });

        contenedorEl.addEventListener('click', (evento) => {
            const objetivo = evento.target;
            if (!(objetivo instanceof Element)) {
                return;
            }

            const boton = objetivo.closest<HTMLButtonElement>('[data-accion]');
            if (!boton) {
                return;
            }

            const id = boton.dataset.id;
            const accion = boton.dataset.accion;
            if (!id || !accion) {
                return;
            }

            cambiarCantidad(id, accion);
        });

        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape' && !panelEl.classList.contains('hidden')) {
                cerrarPanel();
            }
        });

        botonCheckout?.addEventListener('click', () => {
            const items = leerCarrito();
            if (items.length === 0) {
                return;
            }

            const sesion = window.LSAuth ? window.LSAuth.leer() : null;
            const nombre = sesion ? sesion.usuario : 'Cliente';
            const lineas = items.map((item) => (
                `${item.cantidad}x ${item.nombre} — ${formatearPrecio(item.precio * item.cantidad)}`
            ));
            const total = items.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
            const texto = `Hola, soy ${nombre}. Quiero hacer este pedido:\n${lineas.join('\n')}\nTotal: ${formatearPrecio(total)}`;
            const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(texto)}`;

            const enlace = document.createElement('a');
            enlace.href = url;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            mostrarMensaje('Se abrió WhatsApp con tu pedido.', 'ok');
        });

        botonVaciar?.addEventListener('click', () => {
            guardarCarrito([]);
            render();
            mostrarMensaje('Pedido vaciado.', 'info');
        });

        render();
    }

    /* ============================================================
       6. Estado de sesión en el header (demo local)
       ============================================================ */
    function iniciarSesionUI(): void {
        const zona = $<HTMLElement>('#zona-sesion');
        if (!zona || !window.LSAuth) {
            return;
        }

        const zonaEl: HTMLElement = zona;

        function renderSesion(): void {
            zonaEl.replaceChildren();
            const sesion = window.LSAuth.leer();

            if (!sesion) {
                const enlace = document.createElement('a');
                enlace.href = 'login.html';
                enlace.textContent = 'Ingresar';
                zonaEl.appendChild(enlace);
                return;
            }

            const saludo = document.createElement('span');
            saludo.className = 'nav-greeting';
            saludo.textContent = `Hola, ${sesion.usuario}`;

            const salir = document.createElement('button');
            salir.type = 'button';
            salir.textContent = 'Salir';
            salir.addEventListener('click', () => {
                window.LSAuth.cerrar();
                renderSesion();
            });

            zonaEl.append(saludo, salir);
        }

        renderSesion();
    }

    /* ============================================================
       Arranque
       ============================================================ */
    iniciarNavegacionActiva();
    iniciarRevelado();
    iniciarBotonArriba();
    iniciarFormulario();
    iniciarCarrito();
    iniciarSesionUI();

    /* ============================================================
       PWA: registro del service worker
       (los navegadores solo lo permiten en http/https, no en file://)
       ============================================================ */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {
                /* Sin service worker el sitio sigue funcionando con normalidad. */
            });
        });
    }
})();
