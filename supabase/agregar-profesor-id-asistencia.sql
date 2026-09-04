-- agregar-profesor-id-asistencia.sql (Prompt B — R-4, ADITIVO e idempotente)
-- Identidad estructural del profesor: PROFESORES.ID (CLAVE es ambigua: hoy
-- 16 profesores comparten "4321"). Las escrituras NUEVAS rellenan profesor_id;
-- las 81 filas históricas quedan con NULL (backfill imposible, ver informe).
-- Ejecutar en el SQL Editor de Supabase. NO es destructivo.

ALTER TABLE clases_impartidas
  ADD COLUMN IF NOT EXISTS profesor_id integer;

ALTER TABLE asistencia_alumnos
  ADD COLUMN IF NOT EXISTS profesor_id integer;

CREATE INDEX IF NOT EXISTS ix_clases_impartidas_profesor_fecha
  ON clases_impartidas (profesor_id, fecha);

CREATE INDEX IF NOT EXISTS ix_asistencia_alumnos_profesor_fecha
  ON asistencia_alumnos (profesor_id, fecha);

-- No se toca profesor_clave ni las UNIQUE existentes: los UPSERT actuales
-- (profesor_clave, ...) siguen funcionando exactamente igual.
