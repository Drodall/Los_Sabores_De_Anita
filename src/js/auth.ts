/**
 * Sesión de demostración.
 *
 * IMPORTANTE: esto NO es autenticación real. No hay servidor que valide
 * credenciales y la contraseña nunca se guarda ni se verifica. Cualquier
 * persona puede editar localStorage. Sirve solo para asociar un nombre
 * visible al pedido en un prototipo.
 */
(() => {
    'use strict';

    const CLAVE_SESION = 'lsa_sesion';
    const LIMITE_USUARIO = 40;

    function leer(): SesionDemo | null {
        try {
            const crudo = window.localStorage.getItem(CLAVE_SESION);
            if (!crudo) {
                return null;
            }

            const datos: unknown = JSON.parse(crudo);
            if (typeof datos !== 'object' || datos === null) {
                return null;
            }

            const usuario = (datos as { usuario?: unknown }).usuario;
            if (typeof usuario !== 'string') {
                return null;
            }

            const limpio = usuario.trim();
            return limpio ? { usuario: limpio } : null;
        } catch {
            return null;
        }
    }

    function guardar(usuario: string): void {
        const limpio = usuario.trim().slice(0, LIMITE_USUARIO);
        if (!limpio) {
            return;
        }

        try {
            window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ usuario: limpio }));
        } catch {
            /* sin persistencia */
        }
    }

    function cerrar(): void {
        try {
            window.localStorage.removeItem(CLAVE_SESION);
        } catch {
            /* sin persistencia */
        }
    }

    window.LSAuth = { leer, guardar, cerrar };
})();
