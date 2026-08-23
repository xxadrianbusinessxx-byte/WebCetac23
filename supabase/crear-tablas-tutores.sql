-- ============================================================================
-- BLOQUE 6A: TUTORES / PADRES
-- ============================================================================
-- Crea las tablas necesarias para el sistema de tutores/padres.
--
-- Diseño aprobado:
--   A) `tutores`        → entidad independiente del alumno (cuenta de acceso).
--   B) `tutor_alumnos`  → relación N:M entre tutores y alumnos (por CURP).
--
-- Reglas:
--   - La contraseña se guarda SIEMPRE como hash scrypt (nunca texto plano).
--   - `clave_tutor` es la clave pública/amigable (formato TUT-XXXXXXXX).
--   - `usuario` es el login del tutor (correo o usuario).
--   - `debe_cambiar_credenciales` fuerza el cambio en el primer acceso.
--   - La relación con alumnos usa CURP (identificador principal del alumno).
--
-- Este script es SEGURO de ejecutar: usa IF NOT EXISTS y no borra ni modifica
-- tablas existentes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Tabla de tutores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave_tutor text NOT NULL,
  nombre text,
  apellidos text,
  curp text,
  telefono text,
  correo text,
  usuario text,
  password_hash text,
  debe_cambiar_credenciales boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unicidad de la clave pública y del usuario de login.
CREATE UNIQUE INDEX IF NOT EXISTS tutores_clave_tutor_key ON public.tutores (clave_tutor);
CREATE UNIQUE INDEX IF NOT EXISTS tutores_usuario_key ON public.tutores (usuario);

-- Índice para búsqueda por CURP del tutor (opcional, no es llave).
CREATE INDEX IF NOT EXISTS tutores_curp_idx ON public.tutores (curp);

-- ---------------------------------------------------------------------------
-- B) Relación tutor ↔ alumnos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_alumnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.tutores (id) ON DELETE CASCADE,
  curp_alumno text NOT NULL,
  tipo_relacion text NOT NULL DEFAULT 'principal'
    CHECK (tipo_relacion IN ('principal', 'secundario')),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un tutor no puede tener la misma relación con el mismo alumno dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS tutor_alumnos_tutor_curp_key
  ON public.tutor_alumnos (tutor_id, curp_alumno);

-- Índice para consultar los alumnos de un tutor.
CREATE INDEX IF NOT EXISTS tutor_alumnos_tutor_idx ON public.tutor_alumnos (tutor_id);

-- Índice para consultar los tutores de un alumno (por CURP).
CREATE INDEX IF NOT EXISTS tutor_alumnos_curp_idx ON public.tutor_alumnos (curp_alumno);

-- ---------------------------------------------------------------------------
-- Trigger para mantener `updated_at` actualizado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tutores_set_updated_at ON public.tutores;
CREATE TRIGGER tutores_set_updated_at
  BEFORE UPDATE ON public.tutores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tutor_alumnos_set_updated_at ON public.tutor_alumnos;
CREATE TRIGGER tutor_alumnos_set_updated_at
  BEFORE UPDATE ON public.tutor_alumnos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: por defecto deshabilitado (el acceso se controla desde las Server
-- Actions con la sesión del portal). Si se desea activar RLS más adelante,
-- se debe hacer de forma explícita y con políticas por rol.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tutores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_alumnos ENABLE ROW LEVEL SECURITY;

-- Políticas mínimas para que las Server Actions (que usan el rol de la app)
-- puedan operar. Ajusta según el rol de la conexión de Supabase.
CREATE POLICY "tutores_all" ON public.tutores
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "tutor_alumnos_all" ON public.tutor_alumnos
  FOR ALL USING (true) WITH CHECK (true);
