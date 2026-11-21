/**
 * Tipos compartidos entre los scripts clásicos del sitio.
 *
 * Los archivos se cargan con `defer` en este orden: auth.js, luego
 * main.js / login.js. No se usan módulos ES para que el sitio siga
 * funcionando abierto con file://.
 */

interface SesionDemo {
    usuario: string;
}

interface ApiSesionDemo {
    leer(): SesionDemo | null;
    guardar(usuario: string): void;
    cerrar(): void;
}

interface Window {
    LSAuth: ApiSesionDemo;
}
