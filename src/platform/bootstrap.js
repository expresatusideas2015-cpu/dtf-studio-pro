// Bootstrap de la Plataforma
// Inicializa los servicios base, sesión y UI de autenticación.
// Punto de entrada ÚNICO para la FASE 2.4

import { initSession, onAuthStateChange, registerActiveSession, unregisterActiveSession, installSessionHooks } from './session/sessionManager.js';
import { initAuthUI, updateUIState, setGateMode, createPageLockOverlay, updatePageLockOverlay, removePageLockOverlay, ensureGateVisible, showAuthLoaderError } from '/src/platform/auth/authUI.js';
import { initSupabase } from './services/supabaseClient.js';
import * as CloudProtector from './security/cloudProtector.js';
import { initPlatformGuardian } from './core/platformGuardian.js';
import { forceCloseAllSessions, getCompanyStatus } from './companies/companyService.js';

console.log('🔥 BOOTSTRAP CARGADO:', import.meta.url);
console.log("🚀 [BOOT] Plataforma iniciada");
console.log("BOOTSTRAP_BUILD_MARK=2026-01-29-STATIC-A");

// Exponer API de Plataforma para uso en consola o integración futura
window.Platform = {
    Cloud: CloudProtector
};

// 0. Inicializar Cliente Supabase (OBLIGATORIO ANTES QUE TODO)
const supabase = initSupabase();
if (!supabase) {
    console.error("❌ Falló la inicialización de Supabase");
}

createPageLockOverlay('Cargando acceso…');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForProfileByUserId(supabase, userId, retries = 12, delayMs = 400) {
    for (let i = 0; i < retries; i += 1) {
        const { data, error } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("user_id", userId)
            .maybeSingle();
        if (!error && data && data.company_id) return data;
        await new Promise(r => setTimeout(r, delayMs));
    }
    return null;
}

let gateRetryPromise = null;
async function openGateWithRetry() {
    if (gateRetryPromise) return gateRetryPromise;
    gateRetryPromise = (async () => {
        updatePageLockOverlay('Verificando sesión…');
        const maxTries = 80;
        const delay = 50;
        for (let i = 1; i <= maxTries; i += 1) {
            const ok = ensureGateVisible('login');
            console.log('[BOOT] Gate retry attempt', i, 'ok?', ok, 'modal?', !!document.getElementById('authModal'));
            if (ok) {
                updatePageLockOverlay('Listo. Inicia sesión para continuar.');
                await sleep(150);
                removePageLockOverlay();
                return true;
            }
            await sleep(delay);
        }
        console.error('❌ [BOOT] CRITICAL: Gate modal no se pudo abrir tras reintentos. Dejando overlay activo.');
        updatePageLockOverlay('Error cargando acceso. Reintenta recargar (Ctrl+F5).');
        showAuthLoaderError('Error cargando acceso. Recarga la página.');
        return false;
    })().finally(() => {
        gateRetryPromise = null;
    });
    return gateRetryPromise;
}

// 1. Inicializar UI de Autenticación (inyecta widget y modales)
console.log('[BOOT] Calling initAuthUI...');
initAuthUI();
console.log('[BOOT] authUI loaded?', window.__DTF_AUTHUI_LOADED__, window.__DTF_AUTHUI_URL__);
installSessionHooks();

console.log('[BOOT] Initial Gate Lock (Safe Mode)');
setGateMode(true);
openGateWithRetry();

let emergencyTriggered = false;
function emergencyEnsureGate(reason) {
    if (emergencyTriggered) return;
    emergencyTriggered = true;
    console.error('❌ [BOOT] Emergency gate trigger:', reason);
    createPageLockOverlay('Cargando acceso…');
    setGateMode(true);
    const ok = ensureGateVisible('login');
    if (!ok) {
        openGateWithRetry();
    }
    showAuthLoaderError('Error cargando acceso. Recarga la página.');
}

// 2. Suscribir la UI a cambios de estado (ÚNICA FUENTE DE VERDAD)
let lastSeenUserId = null;
let hasRegisteredSession = false;
let currentUser = null;

setTimeout(() => {
    if (!window.__DTF_AUTHUI_LOADED__) {
        showAuthLoaderError('Error cargando acceso. Recarga la página.');
        return;
    }
    if (!currentUser && !document.getElementById('authModal')) {
        emergencyEnsureGate('authModal missing after timeout');
    }
}, 4000);

async function handleAuthStateChange(user, session, event) {
    console.log(`🔄 [Bootstrap] Auth Event: ${event} | User: ${user ? '✅' : '⛔'}`);
    
    // 1. Actualizar UI visual (Avatar, Botones)
    currentUser = user;
    updateUIState(user);

    // 2. Controlar Acceso (Gate Mode) con validaciones de Bloque 3
    if (user) {
        if (lastSeenUserId && lastSeenUserId !== user.id) {
            await unregisterActiveSession('switch-user');
            hasRegisteredSession = false;
        }
        // Si es un evento de actualización de token, no bloqueamos la UI
        const isRefresh = event === 'TOKEN_REFRESHED';
        if (!isRefresh) {
            console.log('[BOOT] Validating session...');
            setGateMode(true); // Bloquear mientras validamos
            createPageLockOverlay('Verificando sesión…');
        }

        try {
            // A. Esperar perfil (creado por trigger) y obtener company
            // Nota: NO crear company/profile desde frontend en este flujo.
            console.log('🔥 [BOOT] Esperando perfil generado por trigger...');
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            console.log('🧭 [BOOT] getSession data:', sessionData, 'error:', sessionError);

            const { data: authData, error: authError } = await supabase.auth.getUser();
            console.log('🧭 [BOOT] getUser data:', authData, 'error:', authError);
            if (authError || !authData?.user?.id) {
                console.error('❌ [BOOT] Error obteniendo usuario:', authError);
                throw new Error('Error al crear perfil de empresa.');
            }

            const profileResult = await waitForProfileByUserId(supabase, authData.user.id, 12, 400);
            if (!profileResult?.company_id) {
                throw new Error('Error al crear perfil de empresa.');
            }

            let onboardingCompleted = false;
            try {
                onboardingCompleted = await getCompanyStatus(supabase, profileResult.company_id);
            } catch (companyError) {
                console.error('❌ [BOOT] Error obteniendo company:', companyError);
                throw new Error('Error al crear perfil de empresa.');
            }
            console.log('🧭 [BOOT] onboarding_completed:', onboardingCompleted);

            // B. Registrar y Validar Sesión Activa
            if (!isRefresh && (!hasRegisteredSession || lastSeenUserId !== user.id)) {
                const reg = await registerActiveSession(user);
                if (reg.ok === true) {
                    hasRegisteredSession = true;
                } else if (reg.code === 'LIMIT_REACHED') {
                    alert(`Acceso Denegado: Límite de sesiones activas alcanzado (Máx ${reg.max || 2}).`);
                    setGateMode(true);
                    createPageLockOverlay('Cargando acceso…');
                    await openGateWithRetry();
                    return;
                } else {
                    alert(`Error de sesión: ${reg.code || 'UNKNOWN'}`);
                    setGateMode(true);
                    createPageLockOverlay('Cargando acceso…');
                    await openGateWithRetry();
                    return;
                }
            } else {
                console.log('🧭 [BOOT] Skip registerActiveSession (refresh or already registered).');
            }

            // C. Todo correcto: Desbloquear y guardar referencia
            lastSeenUserId = user.id;
            removePageLockOverlay();
            setGateMode(false);
            console.log("✅ GATE OFF (USER OK)");
            console.log('🔓 Acceso concedido.');

        } catch (error) {
            console.error('⛔ Acceso denegado:', error.message);
            alert(`Acceso Denegado: ${error.message}`);
            setGateMode(true); // Mantener bloqueado
            createPageLockOverlay('Cargando acceso…');
            await openGateWithRetry();
            // Opcional: forzar logout si es crítico, pero el bloqueo es suficiente
        }

    } else {
        // Logout o sin sesión (MANDATORY GATE)
        console.log("⛔ [BOOT] Sin usuario. Bloqueando sistema.");
        if (lastSeenUserId) {
            await unregisterActiveSession('logout');
            lastSeenUserId = null;
            hasRegisteredSession = false;
        }
        
        setGateMode(true);
        console.log("🔒 GATE ON (NO USER)");
        createPageLockOverlay('Cargando acceso…');
        await openGateWithRetry();
    }
}

let authFlow = Promise.resolve();
onAuthStateChange((user, session, event) => {
    authFlow = authFlow.then(() => handleAuthStateChange(user, session, event)).catch(console.error);
});

window.addEventListener('pageshow', (e) => {
    if (e.persisted && !currentUser) {
        createPageLockOverlay('Cargando acceso…');
        setGateMode(true);
        openGateWithRetry();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !currentUser) {
        createPageLockOverlay('Cargando acceso…');
        setGateMode(true);
        openGateWithRetry();
    }
});


// 3. Inicializar Sesión y luego arrancar Guardian
// Esperamos a la sesión para evitar "parpadeo" del Gate si ya hay usuario.
initSession().then(() => {
    console.log('✅ [Platform] Servicios listos. Arrancando Guardian.');
    initPlatformGuardian();
}).catch(err => {
    console.error('❌ [Platform] Error al inicializar:', err);
    // En caso de error, arrancamos Guardian igual para que maneje el estado de error/no-session
    initPlatformGuardian();
});
