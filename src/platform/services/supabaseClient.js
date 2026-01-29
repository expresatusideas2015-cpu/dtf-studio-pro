
// Módulo de cliente Supabase
// Inicialización limpia y aislada.
// No tiene dependencias del resto del editor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO: Reemplazar con las variables de entorno o configuración real
const SUPABASE_URL = window.SUPABASE_URL || 'https://tu-proyecto.supabase.co';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'tu-anon-key';

let supabase = null;

export function initSupabase(url, key) {
    const finalUrl = url || window.SUPABASE_URL || 'https://yepscqveptmzrhdpoiob.supabase.co';
    const finalKey = key || window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InllcHNjcXZlcHRtenJoZHBvaW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NjMzODcsImV4cCI6MjA4NTAzOTM4N30.uhINKbS3dQlnTffHBpFLpiUFa1CaJtnYUq8QxoaNFQE';

    console.log("🔍 [Supabase] Inicializando con URL:", finalUrl);

    if (!finalUrl || finalUrl.includes('tu-proyecto') || !finalKey) {
        console.error('❌ [Supabase] URL o Key inválidos. Configuración incompleta.');
        return null;
    }

    if (!supabase) {
        try {
            supabase = createClient(finalUrl, finalKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true // Importante para recuperación de contraseña y confirmación de email
                },
                db: {
                    schema: 'public',
                },
            });
            console.log('✅ [Supabase] Cliente inicializado correctamente.', supabase);
        } catch (err) {
            console.error('❌ [Supabase] Error crítico al crear cliente:', err);
            return null;
        }
    }
    return supabase;
}

export function getSupabase() {
    if (!supabase) {
        // Intentar auto-init con globales si existen
        if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
            return initSupabase();
        }
        console.warn('⚠️ [Supabase] Cliente no inicializado. Llama a initSupabase() primero.');
    }
    return supabase;
}
