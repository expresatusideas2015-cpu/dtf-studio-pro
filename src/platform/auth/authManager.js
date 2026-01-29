
// Auth Manager
// Encapsula la lógica de autenticación de Supabase.
// Se coordina con sessionManager para mantener el estado global.

import { getSupabase } from '../services/supabaseClient.js';
import { clearUser } from '../session/sessionManager.js';

/**
 * Registra un nuevo usuario.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user, session, error}>}
 */
export async function signUp(email, password) {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: 'Cliente Supabase no inicializado' } };

    console.log("📝 [Auth] Intentando registrar usuario:", email);
    // Nota: No crear company/profile aquí. Trigger en Supabase se encarga.

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error("❌ [Auth] Error en registro:", error);
        return { user: data?.user, session: data?.session, error };
    }

    console.log("✅ [Auth] Registro exitoso. Data:", data);
    if (!data.session && data.user) {
        console.log("⚠️ [Auth] Registro exitoso pero sin sesión. Posiblemente requiere confirmación de email.");
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            console.error("❌ [Auth] Error al iniciar sesión post-registro:", signInError);
            return { user: data.user, session: null, error: signInError };
        }

        return { user: signInData.user, session: signInData.session, error: null };
    }

    return { user: data.user, session: data.session, error: null };
}

/**
 * Inicia sesión con email y contraseña.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user, session, error}>}
 */
export async function signIn(email, password) {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: 'Cliente Supabase no inicializado' } };

    console.log("🔑 [Auth] Intentando iniciar sesión:", email);

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error("❌ [Auth] Error en login:", error);
    } else {
        console.log("✅ [Auth] Login exitoso:", data.user?.email);
    }

    return { user: data.user, session: data.session, error };
}

/**
 * Inicia sesión con Google (OAuth).
 * @returns {Promise<{error}>}
 */
export async function signInWithGoogle() {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: 'Cliente Supabase no inicializado' } };

    console.log("🌐 [Auth] Iniciando flujo OAuth Google...");

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // Redirección dinámica para soportar local y prod
            redirectTo: window.location.origin + window.location.pathname
        }
    });

    if (error) {
        console.error("❌ [Auth] Error en Google Login:", error);
    }

    return { data, error };
}

/**
 * Cierra la sesión actual.
 * @returns {Promise<{error}>}
 */
export async function signOut() {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: 'Cliente Supabase no inicializado' } };

    const { error } = await supabase.auth.signOut();
    if (!error) {
        // Asegurar limpieza del estado local
        await clearUser();
    }
    return { error };
}

/**
 * Envía correo de recuperación de contraseña.
 * @param {string} email
 * @returns {Promise<{error}>}
 */
export async function resetPassword(email) {
    const supabase = getSupabase();
    if (!supabase) return { error: { message: 'Cliente Supabase no inicializado' } };

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin, // Redirigir a la misma app
    });

    return { error };
}

/**
 * Obtiene la sesión actual de Supabase directamente.
 * Útil para validaciones síncronas rápidas si ya se cargó.
 */
export async function getSession() {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
}
