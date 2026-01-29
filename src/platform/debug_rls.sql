
-- =============================================================================
-- DIAGNÓSTICO DE POLÍTICAS DE SEGURIDAD (RLS) - BLOQUE 3
-- Ejecutar en SQL Editor de Supabase
-- =============================================================================

-- 1. Verificar si RLS está habilitado
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('companies', 'profiles', 'active_sessions');

-- 2. Listar Políticas Existentes (Policies)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('companies', 'profiles', 'active_sessions');

-- =============================================================================
-- HIPÓTESIS:
-- Si RLS está activo (rowsecurity = true) y NO hay políticas de INSERT,
-- Supabase bloquea silenciosamente la escritura (devuelve error 403 o null).
-- =============================================================================

-- 3. SOLUCIÓN PROPUESTA (Si no existen políticas):
-- Descomentar y ejecutar para habilitar la escritura.

/*
-- A. Policies para COMPANIES
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Permitir a cualquier usuario autenticado crear una empresa (Onboarding)
CREATE POLICY "Users can insert companies" 
ON companies FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Permitir ver empresas si soy miembro (via profiles)
CREATE POLICY "Members can view own company" 
ON companies FOR SELECT 
USING (
  id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
);

-- B. Policies para PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Permitir insertarse a sí mismo (Onboarding)
CREATE POLICY "Users can insert own profile" 
ON profiles FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = id);

-- Permitir ver y editar su propio perfil
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- C. Policies para ACTIVE_SESSIONS
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

-- Las sesiones suelen gestionarse via RPC (SECURITY DEFINER), 
-- por lo que a veces no necesitan policies de insert directas si se usa RPC.
-- Pero si hacemos SELECT/UPDATE desde cliente, necesitamos esto:

CREATE POLICY "Users can view own sessions" 
ON active_sessions FOR SELECT 
USING (user_id = auth.uid());

*/
