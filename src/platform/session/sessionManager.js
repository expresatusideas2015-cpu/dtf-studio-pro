// Gestor de Sesión Global
// Maneja el estado del usuario actual y la sesión.
// Aislado del editor principal.

import { getSupabase } from '../services/supabaseClient.js';
import { rpcRegisterSession, rpcUnregisterSession, getDeviceId } from '../companies/companyService.js';

let currentUser = null;
let currentSession = null;
const listeners = [];

let lastRegisteredUserId = null;
let registerInFlight = null;
let unregisterInFlight = null;
let hooksInstalled = false;

const SESSION_ACTIVE_KEY = 'dtf_session_active';
const LAST_USER_KEY = 'dtf_last_user';
const TAB_ID_KEY = 'dtf_tab_id';
const SESSION_LEADER_KEY = 'dtf_session_leader';
const LEADER_TTL_MS = 15000;
let leaderRenewInterval = null;

function getTabId() {
    let tabId = sessionStorage.getItem(TAB_ID_KEY);
    if (!tabId) {
        if (crypto && typeof crypto.randomUUID === 'function') {
            tabId = crypto.randomUUID();
        } else {
            tabId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
        sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
    return tabId;
}

function readLeader() {
    try {
        const raw = localStorage.getItem(SESSION_LEADER_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeLeader(obj) {
    localStorage.setItem(SESSION_LEADER_KEY, JSON.stringify(obj));
}

function isLeaderAlive(leader) {
    return !!leader && typeof leader.ts === 'number' && (Date.now() - leader.ts) < LEADER_TTL_MS;
}

function tryBecomeLeader(userId) {
    const tabId = getTabId();
    const leader = readLeader();
    if (!isLeaderAlive(leader) || leader.tabId === tabId) {
        writeLeader({ tabId, ts: Date.now(), userId });
        return true;
    }
    return false;
}

function renewLeader(userId) {
    const tabId = getTabId();
    const leader = readLeader();
    if (leader && leader.tabId === tabId) {
        writeLeader({ tabId, ts: Date.now(), userId });
        return true;
    }
    return false;
}

function relinquishLeader() {
    const tabId = getTabId();
    const leader = readLeader();
    if (leader && leader.tabId === tabId) {
        localStorage.removeItem(SESSION_LEADER_KEY);
        return true;
    }
    return false;
}

/**
 * Establece el usuario actual y notifica a los listeners.
 * @param {Object} user - Objeto de usuario (Supabase User)
 * @param {Object} session - Objeto de sesión (Supabase Session)
 * @param {string} event - Evento de autenticación (SIGNED_IN, SIGNED_OUT, etc.)
 */
export function setUser(user, session, event = null) {
    currentUser = user;
    currentSession = session;
    notifyListeners(event);
    console.log(`👤 [Session] Usuario: ${user ? user.email : 'Sin usuario'} (${event || 'UPDATE'})`);
    if (!user && event === 'SIGNED_OUT') {
        lastRegisteredUserId = null;
        localStorage.removeItem(SESSION_ACTIVE_KEY);
        localStorage.removeItem(LAST_USER_KEY);
    }
}

/**
 * Limpia la sesión actual (Logout).
 */
export async function clearUser() {
    await unregisterActiveSession('logout');
    localStorage.removeItem(SESSION_ACTIVE_KEY);
    localStorage.removeItem(LAST_USER_KEY);
    lastRegisteredUserId = null;
    relinquishLeader();
    if (leaderRenewInterval) {
        clearInterval(leaderRenewInterval);
        leaderRenewInterval = null;
    }
    const supabase = getSupabase();
    if (supabase) {
        await supabase.auth.signOut();
    }
    // setUser se llamará automáticamente vía onAuthStateChange con SIGNED_OUT
    // Pero por seguridad local:
    if (currentUser) {
        setUser(null, null, 'SIGNED_OUT');
    }
}

/**
 * Obtiene el usuario actual.
 * @returns {Object|null}
 */
export function getUser() {
    return currentUser;
}

/**
 * Obtiene la sesión actual.
 * @returns {Object|null}
 */
export function getSession() {
    return currentSession;
}

/**
 * Verifica si hay un usuario autenticado.
 * @returns {boolean}
 */
export function isAuthenticated() {
    return !!currentUser;
}

/**
 * Suscribe una función a los cambios de sesión.
 * @param {Function} callback - Función a ejecutar cuando cambia el usuario.
 * @returns {Function} Función para desuscribirse.
 */
export function onAuthStateChange(callback) {
    listeners.push(callback);
    // Emitir estado actual inmediatamente
    callback(currentUser, currentSession, 'INITIAL_CHECK');
    
    return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    };
}

function notifyListeners(event) {
    listeners.forEach(cb => cb(currentUser, currentSession, event));
}

// Inicialización automática si hay cliente Supabase
export async function initSession() {
    const supabase = getSupabase();
    if (!supabase) return;

    // Obtener sesión inicial
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        setUser(session.user, session, 'INITIAL_SESSION');
    }

    // Escuchar cambios
    supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null, session, event);
    });
}

/**
 * Evita doble registro y centraliza RPC de sesión.
 */
export async function registerActiveSession(user) {
    if (!user?.id) return { ok: false, code: 'NO_USER' };

    if (
        lastRegisteredUserId === user.id &&
        localStorage.getItem(SESSION_ACTIVE_KEY) === '1' &&
        localStorage.getItem(LAST_USER_KEY) === user.id
    ) {
        return { ok: true, code: 'OK_CACHED' };
    }

    if (registerInFlight) {
        return await registerInFlight;
    }

    registerInFlight = (async () => {
        const isLeader = tryBecomeLeader(user.id);
        if (!isLeader) {
            // Espera corta para que el líder termine el RPC y setee flags.
            for (let i = 0; i < 20; i++) { // 20 * 100ms = 2s
                const active = localStorage.getItem(SESSION_ACTIVE_KEY) === '1';
                const last = localStorage.getItem(LAST_USER_KEY) === user.id;
                if (active && last) {
                    return { ok: true, code: 'FOLLOWER_ACTIVE' };
                }
                await new Promise(r => setTimeout(r, 100));
            }
            // Si el líder fue bloqueado (LIMIT_REACHED) o no registró, el follower NO puede entrar.
            return { ok: false, code: 'LEADER_NOT_READY' };
        }

        const deviceId = getDeviceId();
        console.log('[SESSION] deviceId:', deviceId);
        console.log('[SESSION] register_session payload:', { userId: user.id, deviceId });

        const res = await rpcRegisterSession(user.id, deviceId);

        console.log('[SESSION] register_session response:', res);

        if (res.ok === true) {
            lastRegisteredUserId = user.id;
            localStorage.setItem(SESSION_ACTIVE_KEY, '1');
            localStorage.setItem(LAST_USER_KEY, user.id);
            if (!leaderRenewInterval) {
                leaderRenewInterval = setInterval(() => {
                    renewLeader(user.id);
                }, 5000);
            }
            return { ok: true, code: 'OK', active: res.active, max: res.max, data: res };
        }

        if (res && res.ok === false) {
            return { ok: false, code: res.code || 'UNKNOWN', max: res.max, active: res.active, message: res.message || '' };
        }

        return { ok: false, code: 'UNKNOWN', message: res?.message || '' };
    })().finally(() => {
        registerInFlight = null;
    });

    return await registerInFlight;
}

/**
 * Cierre best-effort de sesión.
 */
export async function unregisterActiveSession(reason = 'unknown') {
    const userId = localStorage.getItem(LAST_USER_KEY);
    const active = localStorage.getItem(SESSION_ACTIVE_KEY) === '1';

    if (!userId || !active) return { ok: true, skipped: true };
    if (unregisterInFlight) return await unregisterInFlight;

    unregisterInFlight = (async () => {
        const leader = readLeader();
        const isMeLeader = leader && leader.tabId === getTabId();
        if (!isMeLeader) {
            return { ok: true, skipped: true, follower: true };
        }
        // soy líder: renuevo timestamp antes de cerrar
        renewLeader(userId);
        const deviceId = getDeviceId();
        console.log('[SESSION] unregister_session payload:', { userId, reason, deviceId });
        const res = await rpcUnregisterSession(userId, deviceId);
        console.log('[SESSION] unregister_session response:', res);
        localStorage.removeItem(SESSION_ACTIVE_KEY);
        localStorage.removeItem(LAST_USER_KEY);
        relinquishLeader();
        if (leaderRenewInterval) {
            clearInterval(leaderRenewInterval);
            leaderRenewInterval = null;
        }
        if (res.ok === true) {
            return { ok: true, code: 'OK', ended: res.ended ?? res.kicked ?? 0 };
        }
        return { ok: false, code: res.code || 'RPC_ERROR', message: res.message || '' };
    })().finally(() => {
        unregisterInFlight = null;
    });

    return await unregisterInFlight;
}

/**
 * Hooks de cierre best-effort.
 */
export function installSessionHooks() {
    if (hooksInstalled) return;
    hooksInstalled = true;

    window.addEventListener('pagehide', () => {
        if (localStorage.getItem(SESSION_ACTIVE_KEY) === '1') {
            unregisterActiveSession('pagehide');
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            const userId = localStorage.getItem(LAST_USER_KEY);
            if (userId) {
                renewLeader(userId);
            }
        }
    });

    window.addEventListener('storage', (e) => {
        if (e.key === SESSION_LEADER_KEY) {
            // No-op: leader status is checked on next register
        }
    });
}
