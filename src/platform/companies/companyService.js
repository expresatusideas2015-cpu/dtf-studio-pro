
import { getSupabase } from '../services/supabaseClient.js';
console.log("COMPANY_SERVICE_BUILD_MARK=2026-01-29-STATIC-A");
console.log("SESSIONS_BUILD_MARK=2026-01-29-STATIC-FIX");

const DEVICE_KEY = 'dtf_device_id';

/**
 * Servicio de Empresas y Sesiones (Bloque 3)
 * Maneja la creaciÃ³n de perfiles, empresas y control de sesiones activas.
 */

/**
 * Obtiene el perfil de usuario.
 * @param {string} userId
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getProfile(userId) {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase no inicializado' };
    return await supabase.from("profiles").select("company_id").eq("user_id", userId).maybeSingle();
}

export function getDeviceId() {
    let deviceId = localStorage.getItem(DEVICE_KEY);
    if (!deviceId) {
        if (crypto && typeof crypto.randomUUID === 'function') {
            deviceId = crypto.randomUUID();
        } else {
            deviceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
        localStorage.setItem(DEVICE_KEY, deviceId);
    }
    return deviceId;
}

export async function rpcRegisterSession(p_user_id, p_device_id) {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, code: 'RPC_ERROR', message: 'Supabase no inicializado' };
    const { data, error } = await supabase.rpc('register_session', {
        p_user_id,
        p_device_id
    });
    if (error) {
        return { ok: false, code: 'RPC_ERROR', message: error.message };
    }
    if (data && typeof data === 'object') {
        return data;
    }
    return { ok: false, code: 'RPC_ERROR', message: 'Respuesta RPC inválida' };
}

export async function rpcUnregisterSession(p_user_id, p_device_id) {
    const supabase = getSupabase();
    if (!supabase) return { ok: false, code: 'RPC_ERROR', message: 'Supabase no inicializado' };
    const { data, error } = await supabase.rpc('unregister_session', {
        p_user_id,
        p_device_id
    });
    if (error) {
        return { ok: false, code: 'RPC_ERROR', message: error.message };
    }
    if (data && typeof data === 'object') {
        return data;
    }
    return { ok: false, code: 'RPC_ERROR', message: 'Respuesta RPC inválida' };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espera a que exista el perfil generado por el trigger.
 * @param {object} supabase
 * @param {number} retries
 * @param {number} delayMs
 * @returns {Promise<{company_id: string}>}
 */
export async function waitForProfile(supabase, retries = 12, delayMs = 400) {
    if (!supabase) {
        throw new Error('Supabase no inicializado');
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) {
        console.error('âŒ [CompanyService] getUser error:', userError);
        throw new Error('Error al validar usuario.');
    }

    const userId = userData?.user?.id;
    if (!userId) {
        throw new Error('Usuario invalido.');
    }

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        const { data, error } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('user_id', userId)
            .maybeSingle();

        console.log('ðŸ§­ [CompanyService] waitForProfile attempt', attempt, 'data:', data, 'error:', error);

        if (!error && data?.company_id) {
            return { company_id: data.company_id, user_id: userId };
        }

        if (attempt < retries) {
            await sleep(delayMs);
        }
    }

    throw new Error('Error al crear perfil de empresa.');
}

/**
 * Obtiene la empresa y su estado de onboarding.
 * @param {object} supabase
 * @param {string} companyId
 * @returns {Promise<{onboarding_completed: boolean, company_name?: string}>}
 */
export async function getCompanyStatus(supabase, companyId) {
    if (!supabase) {
        throw new Error('Supabase no inicializado');
    }
    if (!companyId) {
        throw new Error('CompanyId invÃ¡lido');
    }

    const { data, error } = await supabase
        .from('companies')
        .select('onboarding_completed')
        .eq('id', companyId)
        .single();

    console.log('ðŸ§­ [CompanyService] getCompanyStatus data:', data, 'error:', error);

    if (error) {
        console.error('âŒ [CompanyService] getCompanyStatus error:', error);
        throw error;
    }

    return !!data?.onboarding_completed;
}

/**
 * Crea una empresa y un perfil de administrador para el usuario.
 * Nota: NO usar durante bootstrap/signup/login cuando existe trigger en Supabase.
 * @param {object} user - Objeto user de Supabase
 * @returns {Promise<{data: any, error: any}>}
 */
export async function createCompanyAndProfile(user) {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase no inicializado' };

    console.log('ðŸ¢ [CompanyService] Creando empresa y perfil para:', user.email);

    // 1. Crear Empresa
    const companyName = (user.user_metadata?.full_name || user.email.split('@')[0]) + " Studio";
    
    console.log(`ðŸ› ï¸ [CompanyService] Intentando insertar empresa: "${companyName}"`);

    // Nota: Asumimos que la tabla companies tiene columnas 'name' y 'plan'.
    const { data: company, error: companyError, status: companyStatus } = await supabase
        .from('companies')
        .insert([{ 
            company_name: companyName,
            plan: 'free', // Plan por defecto
            created_at: new Date()
        }])
        .select()
        .single();

    if (companyError) {
        console.error(`âŒ [CompanyService] Error al crear empresa (Status: ${companyStatus}):`, companyError);
        return { error: companyError };
    }

    console.log('âœ… [CompanyService] Empresa creada con ID:', company?.id);

    // 2. Crear Perfil vinculado
    console.log(`ðŸ› ï¸ [CompanyService] Intentando insertar perfil para user: ${user.id} vinculado a company: ${company.id}`);

    const { data: profile, error: profileError, status: profileStatus } = await supabase
        .from('profiles')
        .insert([{
            user_id: user.id,
            email: user.email,
            company_id: company.id,
            role: 'admin',
            created_at: new Date()
        }])
        .select()
        .single();

    if (profileError) {
        console.error(`âŒ [CompanyService] Error al crear perfil (Status: ${profileStatus}):`, profileError);
        // TODO: PodrÃ­amos intentar borrar la empresa huÃ©rfana aquÃ­ si fuera estricto
        return { error: profileError };
    }

    console.log('âœ… [CompanyService] Perfil creado correctamente:', profile?.id);

    return { data: { company, profile }, error: null };
}

/**
 * HARDENING: FunciÃ³n de emergencia para cerrar TODAS las sesiones del usuario.
 * Ãštil cuando el usuario queda bloqueado y no sabe dÃ³nde dejÃ³ la sesiÃ³n abierta.
 */
export async function forceCloseAllSessions(userId) {
    const supabase = getSupabase();
    if (!supabase) return;

    console.warn('ðŸ”¥ [CompanyService] Ejecutando cierre de emergencia de sesiones...');

    // Requiere una RPC nueva 'force_logout_all' o delete directo
    const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('user_id', userId);

    if (error) {
        console.error('âŒ Error en cierre de emergencia:', error);
        return { success: false, error };
    }
    
    return { success: true };
}


