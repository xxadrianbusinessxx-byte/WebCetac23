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
