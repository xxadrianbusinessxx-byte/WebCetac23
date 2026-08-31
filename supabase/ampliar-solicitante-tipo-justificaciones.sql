-- ============================================================================
-- AMPLIAR SOLICITANTE_TIPO EN JUSTIFICACIONES — BLOQUE 9 (PIEZA 3)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (después de crear-tablas-justificaciones.sql
-- y, si aplica, migrar-justificaciones-v2.sql)
--
-- OBJETIVO:
--   Permitir que el PROFESOR (o directivo) solicite justificaciones de falta
--   para sus alumnos. El CHECK de `solicitante_tipo` se amplía de
--   ('tutor', 'alumno') a ('tutor', 'alumno', 'profesor').
--
-- NOTA SOBRE EL NOMBRE DEL CONSTRAINT:
--   El CHECK original se creó como CHECK inline sobre la columna en
--   supabase/crear-tablas-justificaciones.sql:
--       solicitante_tipo text NOT NULL DEFAULT 'tutor'
--         CHECK (solicitante_tipo IN ('tutor', 'alumno'))
--   PostgreSQL auto-nombra esos CHECK de columna como
--   «{tabla}_{columna}_check» → justificaciones_asistencia_solicitante_tipo_check.
--   El DROP usa IF EXISTS para ser seguro si ya no existe.
--
-- Idempotente: seguro de re-ejecutar.
-- ============================================================================

ALTER TABLE justificaciones_asistencia
  DROP CONSTRAINT IF EXISTS justificaciones_asistencia_solicitante_tipo_check;

ALTER TABLE justificaciones_asistencia
  ADD CONSTRAINT justificaciones_asistencia_solicitante_tipo_check
  CHECK (solicitante_tipo IN ('tutor', 'alumno', 'profesor'));
