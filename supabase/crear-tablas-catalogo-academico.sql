-- ============================================================================
-- CATÁLOGO ACADÉMICO — FASE C1 (versión congelada en FASE 3.2)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- Este SQL SOLO CREA tablas nuevas. NO borra ni modifica tablas existentes.
--
-- PRINCIPIO: OFERTA != ASIGNACIÓN != IDENTIDAD != PERFIL != ALMACÉN
--   ALUMNOS = identidad (legacy, NO se toca).
--   ETIQUETAS PERSONALES = perfil privado (legacy, NO se toca).
--   periodos/carreras/materias/grupos/grupo_materias = oferta.
--   inscripciones_alumno = alumno → grupo.
--   asignaciones_profesor = profesor_clave → grupo_materia.
--   grupo_materias.tabla_legacy = puente físico temporal al almacén legacy.
--
-- DECISIONES CONGELADAS:
--   1) materias.clave (y carreras.clave) = identidad estable UNIQUE;
--      nombre = presentación modificable.
--   2) grupos usa ÍNDICES ÚNICOS PARCIALES (carrera_id NULL vs no NULL) porque
--      UNIQUE(...) no previene duplicados con NULL.
--   3) inscripciones_alumno.curp y asignaciones_profesor.profesor_clave NO
--      tienen FK a tablas legacy (ALUMNOS/PROFESORES); la capa valida existencia.
--   4) tabla_legacy NO es identidad de materia, NO se parsea para oferta, NO
--      se propaga por la aplicación.
--   5) Ninguna tabla conoce salud/etiquetas/Excel/UI/profesores como FK.
--   6) activo = «disponible/vigente para operación»; NUNCA se borran históricos.
--   7) grado y grupos.nombre son text libres (NO ENUM, NO arrays): 1RO–6TO y
--      A–D son solo configuración inicial; el modelo acepta 7MO/E/F/G/etc.
--   8) FKs de catálogo usan ON DELETE RESTRICT (proteger historial).
-- ============================================================================

-- ============================================================================
-- 1) PERIODOS — ciclo escolar
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,                      -- ej. "2026-2027"
  activo boolean NOT NULL DEFAULT true,      -- disponible para operación/selección
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS periodos_nombre_key ON public.periodos (nombre);

-- ============================================================================
-- 2) CARRERAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.carreras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL,                       -- identidad estable, ej. "RH" / "MECATRONICA"
  nombre text,                               -- presentación modificable, ej. "Recursos Humanos"
  activo boolean NOT NULL DEFAULT true,      -- disponible para crear/editar oferta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS carreras_clave_key ON public.carreras (clave);

-- ============================================================================
-- 3) MATERIAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.materias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL,                       -- IDENTIDAD ESTABLE, ej. "MATEMATICAS-IV"
  nombre text,                               -- presentación modificable, ej. "Matemáticas IV"
  activo boolean NOT NULL DEFAULT true,      -- disponible para nueva oferta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS materias_clave_key ON public.materias (clave);

-- ============================================================================
-- 4) GRUPOS — identidad = (periodo, grado, nombre, carrera[NULL])
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES public.periodos (id) ON DELETE RESTRICT,
  grado text NOT NULL,                       -- text libre, ej. "1RO" (NO ENUM)
  nombre text NOT NULL,                      -- text libre, ej. "D" (NO ENUM, NO arrays)
  carrera_id uuid REFERENCES public.carreras (id) ON DELETE RESTRICT,  -- NULL = grado sin carrera
  activo boolean NOT NULL DEFAULT true,      -- grupo disponible para operación
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Únicos parciales (carrera NULL vs no NULL) — ver decisión 2.
CREATE UNIQUE INDEX IF NOT EXISTS grupos_sin_carrera_uq
  ON public.grupos (periodo_id, grado, nombre) WHERE carrera_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS grupos_con_carrera_uq
  ON public.grupos (periodo_id, grado, nombre, carrera_id) WHERE carrera_id IS NOT NULL;

-- Índice para listar grupos de un periodo.
CREATE INDEX IF NOT EXISTS grupos_periodo_idx ON public.grupos (periodo_id);

-- ============================================================================
-- 5) GRUPO_MATERIAS — «esta materia existe para este grupo en este periodo»
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grupo_materias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos (id) ON DELETE RESTRICT,
  materia_id uuid NOT NULL REFERENCES public.materias (id) ON DELETE RESTRICT,
  tabla_legacy text,                       -- PUENTE FÍSICO TEMPORAL al nombre
                                           -- exacto de la tabla legacy de notas.
  activo boolean NOT NULL DEFAULT true,    -- materia disponible dentro de ese grupo
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grupo_materias_unico UNIQUE (grupo_id, materia_id)
);

CREATE INDEX IF NOT EXISTS grupo_materias_materia_idx ON public.grupo_materias (materia_id);

-- ============================================================================
-- 6) INSCRIPCIONES_ALUMNO — pertenencia alumno → grupo (relación histórica)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.inscripciones_alumno (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curp text NOT NULL,                      -- validación de existencia en ALUMNOS en la capa
  grupo_id uuid NOT NULL REFERENCES public.grupos (id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,    -- relación alumno-grupo vigente
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inscripciones_alumno_unico UNIQUE (curp, grupo_id)
);

CREATE INDEX IF NOT EXISTS inscripciones_curp_idx ON public.inscripciones_alumno (curp);
CREATE INDEX IF NOT EXISTS inscripciones_grupo_idx ON public.inscripciones_alumno (grupo_id);
-- Índice parcial para localizar la inscripción ACTIVA de un alumno.
CREATE INDEX IF NOT EXISTS inscripciones_curp_activa_idx
  ON public.inscripciones_alumno (curp) WHERE activo = true;

-- ============================================================================
-- 7) ASIGNACIONES_PROFESOR — profesor_clave → grupo_materia (independiente)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.asignaciones_profesor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_materia_id uuid NOT NULL REFERENCES public.grupo_materias (id) ON DELETE RESTRICT,
  profesor_clave text NOT NULL,            -- PROFESORES.CLAVE (validación en la capa)
  activo boolean NOT NULL DEFAULT true,    -- asignación actualmente habilitada
  desde timestamptz NOT NULL DEFAULT now(),
  hasta timestamptz,                       -- NULL mientras esté vigente
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asignaciones_profesor_unico UNIQUE (grupo_materia_id, profesor_clave)
);

CREATE INDEX IF NOT EXISTS asignaciones_profesor_idx ON public.asignaciones_profesor (profesor_clave);
CREATE INDEX IF NOT EXISTS asignaciones_profesor_gm_idx ON public.asignaciones_profesor (grupo_materia_id);

-- ============================================================================
-- Trigger para mantener updated_at (mismo patrón que el resto del proyecto).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['periodos','carreras','materias','grupos','grupo_materias','inscripciones_alumno','asignaciones_profesor']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- RLS: mismo patrón del proyecto (Server Actions controlan el acceso).
-- ============================================================================
ALTER TABLE public.periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carreras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_materias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscripciones_alumno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignaciones_profesor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "periodos_all" ON public.periodos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "carreras_all" ON public.carreras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "materias_all" ON public.materias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "grupos_all" ON public.grupos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "grupo_materias_all" ON public.grupo_materias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inscripciones_alumno_all" ON public.inscripciones_alumno FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "asignaciones_profesor_all" ON public.asignaciones_profesor FOR ALL USING (true) WITH CHECK (true);
