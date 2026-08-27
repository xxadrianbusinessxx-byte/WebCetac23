-- ============================================================================
-- C4.14 — CONTROL ADMINISTRATIVO DE OFERTA ACADÉMICA POR SEMESTRE
--
-- Modelo:
--   * SEMESTRE = clasificación de la oferta por grado (1RO→1 … 6TO→6) dentro
--     de un PERIODO (ciclo escolar, tabla `periodos`).
--   * `academico_semestres` guarda el estado activo/inactivo por
--     (periodo_id, semestre). Sin fila ⇒ semestre ACTIVO (default; no rompe
--     la visualización actual).
--
-- Principios:
--   * Desactivar NUNCA borra: UPDATE activo=false (historial conservado).
--   * No se tocan materias, grupo_materias, grupos, asignaciones_profesor,
--     PROFESORES, profesor_clave, asistencia, boleta ni ETIQUETAS.
--   * La desactivación de un semestre deja de mostrar esa oferta en la
--     visualización normal del alumno, pero los registros del catálogo se
--     conservan intactos.
--   * RLS pública (mismo patrón deliberado del resto del catálogo).
--
-- Aplicable en el SQL editor de Supabase. COMPLETAMENTE IDEMPOTENTE.
-- NO ejecutar desde herramientas sin conexión directa autorizada.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.academico_semestres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES public.periodos (id) ON DELETE RESTRICT,
  semestre smallint NOT NULL CHECK (semestre BETWEEN 1 AND 12),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academico_semestres_unico UNIQUE (periodo_id, semestre)
);

CREATE INDEX IF NOT EXISTS academico_semestres_periodo_idx
  ON public.academico_semestres (periodo_id);

-- Trigger updated_at (mismo patrón del catálogo; función idempotente).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'academico_semestres_set_updated_at'
  ) THEN
    CREATE TRIGGER academico_semestres_set_updated_at
      BEFORE UPDATE ON public.academico_semestres
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- RLS pública (lectura/escritura para el rol autenticado por la app;
-- la autorización de negocio se valida en las Server Actions).
ALTER TABLE public.academico_semestres ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'academico_semestres'
      AND policyname = 'academico_semestres_all'
  ) THEN
    CREATE POLICY "academico_semestres_all"
      ON public.academico_semestres
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN (ejecutar en SQL Editor tras aplicar):
--   SELECT periodos.nombre, s.semestre, s.activo, s.created_at, s.updated_at
--   FROM public.academico_semestres s
--   JOIN public.periodos ON periodos.id = s.periodo_id
--   ORDER BY s.semestre;
-- ============================================================================
