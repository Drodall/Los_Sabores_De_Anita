/**
 * Página de inicio de sesión (demostración).
 *
 * La contraseña se pide para completar el flujo, pero se descarta: no se
 * envía ni se guarda. Ver auth.ts para la advertencia de seguridad.
 */
(() => {
    'use strict';

    const formulario = document.querySelector<HTMLFormElement>('#form-login');
    const campoUsuario = document.querySelector<HTMLInputElement>('#usuario');
    const campoClave = document.querySelector<HTMLInputElement>('#clave');
    const salida = document.querySelector<HTMLElement>('#login-mensaje');
    const bloqueActivo = document.querySelector<HTMLElement>('#sesion-activa');
    const nombreActivo = document.querySelector<HTMLElement>('#sesion-nombre');
    const botonSalir = document.querySelector<HTMLButtonElement>('#cerrar-sesion');

    function mostrar(texto: string, tipo: 'error' | 'ok'): void {
        if (!salida) {
            return;
        }

        salida.textContent = texto;
        salida.dataset.tipo = tipo;
    }

    function renderSesion(): void {
        const sesion = window.LSAuth.leer();

        if (!bloqueActivo || !formulario) {
            return;
        }

        if (sesion) {
            bloqueActivo.classList.remove('hidden');
            formulario.classList.add('hidden');
            if (nombreActivo) {
                nombreActivo.textContent = sesion.usuario;
            }
        } else {
            bloqueActivo.classList.add('hidden');
            formulario.classList.remove('hidden');
        }
    }

    formulario?.addEventListener('submit', (evento) => {
        evento.preventDefault();

        const usuario = (campoUsuario?.value ?? '').trim();
        const clave = campoClave?.value ?? '';

        if (usuario.length < 3) {
            mostrar('El usuario debe tener al menos 3 caracteres.', 'error');
            campoUsuario?.focus();
            return;
        }

        if (clave.length < 4) {
            mostrar('La contraseña debe tener al menos 4 caracteres.', 'error');
            campoClave?.focus();
            return;
        }

        window.LSAuth.guardar(usuario);
        mostrar('Sesión iniciada. Redirigiendo…', 'ok');

        window.setTimeout(() => {
            window.location.href = 'index.html';
        }, 600);
    });

    botonSalir?.addEventListener('click', () => {
        window.LSAuth.cerrar();
        renderSesion();
        mostrar('Sesión cerrada.', 'ok');
    });

    renderSesion();
})();
