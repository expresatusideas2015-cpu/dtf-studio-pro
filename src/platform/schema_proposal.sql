-- ESQUEMA DE BASE DE DATOS PROPUESTO - FASE 2.1 (Infraestructura Base)

-- 1. COMPANIES
-- Entidad principal para multi-tenancy.
-- Razón: Permite que múltiples organizaciones usen la plataforma de forma aislada.
create table public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  tax_id text, -- NIT/RUT/CIF
  plan_tier text default 'free', -- 'free', 'pro', 'enterprise'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. COMPANY_USERS
-- Relación entre usuarios (auth.users) y compañías.
-- Razón: Un usuario puede pertenecer a una compañía con un rol específico.
create table public.company_users (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text default 'member', -- 'owner', 'admin', 'member', 'viewer'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(company_id, user_id)
);

-- 3. PROJECTS
-- Metadatos del proyecto.
-- Razón: Separar la identidad del proyecto de sus versiones/datos pesados.
create table public.projects (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  thumbnail_url text, -- URL del preview más reciente
  is_archived boolean default false,
  current_version_id uuid, -- Referencia a la versión activa (circular, se resuelve con update)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. PROJECT_VERSIONS
-- Historial y datos del proyecto.
-- Razón: Control de versiones y "undo" a nivel de guardado.
create table public.project_versions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references public.projects(id) on delete cascade not null,
  version_number integer not null,
  data jsonb not null, -- El JSON completo del canvas/estado
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, version_number)
);

-- 5. BLOBS
-- Registro de archivos pesados subidos a Storage.
-- Razón: Deduplicación y control de uso de almacenamiento. 
-- Si dos proyectos usan la misma imagen (mismo hash), solo se guarda una vez en Storage.
create table public.blobs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  storage_path text not null, -- Ruta en Supabase Storage (bucket/path)
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  hash text not null, -- SHA-256 del contenido para deduplicación
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. LICENSES
-- Control de suscripciones y accesos.
-- Razón: Gestión de pagos y vigencia del servicio.
create table public.licenses (
  id uuid default gen_random_uuid() primary key,
  company_id uuid references public.companies(id) on delete cascade not null,
  license_key text unique not null,
  status text default 'active', -- 'active', 'expired', 'suspended'
  valid_from timestamp with time zone default timezone('utc'::text, now()) not null,
  valid_until timestamp with time zone,
  features jsonb default '{}'::jsonb, -- Features habilitados
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
