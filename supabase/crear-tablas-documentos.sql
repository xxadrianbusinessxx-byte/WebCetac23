-- ============================================================================
-- PESTAÑA DOCUMENTOS — Esquema de base de datos
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
-- ============================================================================

-- CARPETAS (árbol jerárquico de carpetas)
CREATE TABLE IF NOT EXISTS "CARPETAS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  parent_id uuid REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  creado_por text,
  created_at timestamptz DEFAULT now()
);

-- DOCUMENTOS (archivos dentro de carpetas)
CREATE TABLE IF NOT EXISTS "DOCUMENTOS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpeta_id uuid NOT NULL REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  nombre_original text NOT NULL,
  ruta_storage text NOT NULL,
  tipo text,
  tamano_bytes bigint,
  curp_vinculado text,
  subido_por text,
  created_at timestamptz DEFAULT now()
);

-- PERMISOS CARPETAS (acceso heredado por rama)
CREATE TABLE IF NOT EXISTS "PERMISOS CARPETAS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor text NOT NULL,
  carpeta_id uuid NOT NULL REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  nivel text NOT NULL CHECK (nivel IN ('ver','subir','eliminar')),
  autorizado_por text,
  created_at timestamptz DEFAULT now()
);
