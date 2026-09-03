-- ============================================================================
-- F7 — ASISTENCIA ASOCIADA AL CONTEXTO (periodo_id / periodo_evaluacion_id)
-- ADITIVO, IDEMPOTENTE, SIN DELETE/DROP de datos. Backfill NO destructivo:
-- las filas existentes quedan NULL y se resuelven por fecha cuando sea seguro.
-- Ejecutar en Supabase SQL Editor.
-- ============================================================================

-- 1) CLASES IMPARTIDAS
ALTER TABLE public.clases_impartidas ADD COLUMN IF NOT EXISTS periodo_id uuid;
ALTER TABLE public.clases_impartidas ADD COLUMN IF NOT EXISTS periodo_evaluacion_id uuid;
CREATE INDEX IF NOT EXISTS clases_impartidas_periodo_idx ON public.clases_impartidas (periodo_id, fecha);

-- 2) ASISTENCIA ALUMNOS
ALTER TABLE public.asistencia_alumnos ADD COLUMN IF NOT EXISTS periodo_id uuid;
ALTER TABLE public.asistencia_alumnos ADD COLUMN IF NOT EXISTS periodo_evaluacion_id uuid;
CREATE INDEX IF NOT EXISTS asistencia_alumnos_periodo_idx ON public.asistencia_alumnos (periodo_id, fecha);

-- 3) JUSTIFICACIONES
ALTER TABLE public.justificaciones_asistencia ADD COLUMN IF NOT EXISTS periodo_id uuid;
CREATE INDEX IF NOT EXISTS justificaciones_periodo_idx ON public.justificaciones_asistencia (periodo_id, fecha);

-- ============================================================================
-- ROLLBACK (documentado):
--   ALTER TABLE ... DROP COLUMN IF EXISTS periodo_evaluacion_id / periodo_id;
--   DROP INDEX IF EXISTS ...;
-- ============================================================================
