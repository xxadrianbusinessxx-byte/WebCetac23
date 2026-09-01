-- ============================================================================
-- CAMPOS PERSONALES DEFINIDOS ADITIVOS — ETIQUETAS PERSONALES (FASE 2)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (MANUAL; NO ejecutado automáticamente)
--
-- Añade los campos estructurados EDAD y ESTATURA al modelo de datos personales
-- del alumno. Son CAMPOS DEFINIDOS (no etiquetas dinámicas): NO migran a
-- `alumno_etiquetas` y NO contienen grado/grupo/carrera (eso vive en el
-- catálogo académico).
--
-- El código de la app es tolerante: si estas columnas no existen aún, la
-- lectura de ETIQUETAS PERSONALES cae a la lista base (no se rompe nada).
--
-- Este SQL es ADITIVO e idempotente: no borra ni modifica datos existentes.
-- ============================================================================

ALTER TABLE "ETIQUETAS PERSONALES"
  ADD COLUMN IF NOT EXISTS EDAD text,
  ADD COLUMN IF NOT EXISTS ESTATURA text;

-- ============================================================================
-- VERIFICACIÓN (SQL Editor):
--   SELECT "CURP", EDAD, ESTATURA FROM "ETIQUETAS PERSONALES" LIMIT 5;
-- ============================================================================
