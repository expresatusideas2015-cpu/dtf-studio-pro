
import { isAuthenticated } from '../session/sessionManager.js';
import { setGateMode } from '/src/platform/auth/authUI.js';

/**
 * Guardián de Plataforma
 * Verifica el estado de autenticación al inicio y decide si bloquear el acceso.
 * 
 * Este módulo es invocado por bootstrap.js al arrancar la aplicación.
 */
export function initPlatformGuardian() {
    console.log('🛡️ [Guardian] Iniciando sistema de protección...');
    
    try {
        // Verificar sesión actual (síncrona si ya cargó, o estado inicial)
        const isAuth = isAuthenticated();
        
        if (!isAuth) {
            console.warn('🛡️ [Guardian] Usuario no autenticado. Activando Gate (Bloqueo de UI).');
            setGateMode(true);
        } else {
            console.log('🛡️ [Guardian] Usuario autenticado. Acceso permitido.');
            setGateMode(false);
        }
    } catch (error) {
        console.error('❌ [Guardian] Error crítico al verificar acceso:', error);
        console.warn('🛡️ [Guardian] Activando Gate por seguridad debido a error.');
        // Fallback seguro: bloquear si hay error para evitar uso no autorizado por fallo
        setGateMode(true);
    }
}



