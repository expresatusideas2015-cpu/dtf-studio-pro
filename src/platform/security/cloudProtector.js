// Cloud Action Protector
// Intercepta acciones que requieren nube y verifica sesión.
// Si no hay sesión, pide login sin romper el flujo del editor.

import { isAuthenticated } from '../session/sessionManager.js';
import { requestLogin } from '/src/platform/auth/authUI.js';

/**
 * Ejecuta una acción protegida si hay sesión.
 * Si no, solicita login.
 * @param {Function} action - Función a ejecutar si está autenticado.
 * @param {string} actionName - Nombre de la acción para logs.
 * @returns {Promise<any>} Resultado de la acción o null si fue bloqueada.
 */
export async function protectCloudAction(action, actionName = 'Acción Cloud') {
    if (isAuthenticated()) {
        console.log(`🔒 [Cloud] Ejecutando: ${actionName}`);
        try {
            return await action();
        } catch (error) {
            console.error(`❌ [Cloud] Error en ${actionName}:`, error);
            throw error;
        }
    } else {
        console.warn(`🔒 [Cloud] Acceso denegado a: ${actionName}. Solicitando login.`);
        requestLogin();
        // Opcional: Podríamos retornar un objeto indicando que se requiere auth
        return null;
    }
}

// Wrappers Mockup (Se conectarán al motor real cuando esté lista la lógica de negocio cloud)
// Estas funciones se pueden importar en la UI del editor para reemplazar los botones locales
// cuando se quiera "activar" la nube.

export const saveCloud = () => protectCloudAction(async () => {
    console.log("☁️ [Mock] Guardando proyecto en la nube...");
    // TODO: Conectar con src/platform/services/projectService.js (Fase 3)
    return { success: true, id: 'proj_123' };
}, 'Guardar en Nube');

export const loadCloud = () => protectCloudAction(async () => {
    console.log("☁️ [Mock] Cargando proyectos de la nube...");
    // TODO: Conectar con src/platform/services/projectService.js (Fase 3)
    return [{ id: 'proj_123', name: 'Proyecto Demo' }];
}, 'Cargar de Nube');

export const sync = () => protectCloudAction(async () => {
    console.log("☁️ [Mock] Sincronizando cambios...");
    return { synced: true };
}, 'Sincronización');



