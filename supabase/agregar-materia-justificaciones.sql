-- ============================================================================
-- SUPERSEDIDO — NO EJECUTAR
-- ============================================================================
-- Este archivo quedó **SUPERSEDIDO** por
-- `supabase/agregar-grupo-materia-justificaciones.sql` (PROMPT-1, T1/A1) y se
-- conserva únicamente como memoria del esquema (R8 · ORDEN.md §5: nada se
-- borra de supabase/).
--
-- Por qué quedó supersedido: este SQL añadía `materia_clave text`, un
-- identificador de materia NUEVO por texto. PROMPT-1 decidió (decisión ya
-- tomada, no re-decidir) que la relación es `grupo_materia_id uuid`, la misma
-- que `clases_impartidas` y `asistencia_alumnos` ya usan con 0 huérfanos:
-- un identificador de texto más violaría R5. Este archivo nunca llegó a
-- ejecutarse en producción.
--
-- NO ejecutar. Usar `supabase/agregar-grupo-materia-justificaciones.sql`.
-- ============================================================================

-- agregar-materia-justificaciones.sql (Prompt B — R-3, ADITIVO e idempotente)
-- Justificación POR CLASE: la solicitud guarda la materia del horario.
-- Ejecutar en el SQL Editor de Supabase (orden sugerido: primero este, después
-- agregar-profesor-id-asistencia.sql).

ALTER TABLE justificaciones_asistencia
  ADD COLUMN IF NOT EXISTS materia_clave text;

-- Sustituir la UNIQUE (curp_alumno, fecha) por un índice único sobre
-- (curp_alumno, fecha, COALESCE(materia_clave,'')). En Postgres los NULL son
-- distintos entre sí: sin el COALESCE se duplicarían las de día completo.
DROP INDEX IF EXISTS justificaciones_asistencia_curp_fecha_materia_unique;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'justificaciones_asistencia'::regclass
      AND conname = 'justificaciones_asistencia_curp_alumno_fecha_key'
  ) THEN
    ALTER TABLE justificaciones_asistencia
      DROP CONSTRAINT justificaciones_asistencia_curp_alumno_fecha_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS justificaciones_asistencia_curp_fecha_materia_unique
  ON justificaciones_asistencia (curp_alumno, fecha, COALESCE(materia_clave, ''));

-- materia_clave IS NULL = justificación de DÍA COMPLETO (comportamiento actual
-- preservado: compatibilidad aditiva).
