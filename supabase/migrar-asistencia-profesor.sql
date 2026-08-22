-- ============================================================================
-- MIGRACIÓN SEGURA — BLOQUE 5B (ASISTENCIAS MULTIPROFESOR)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Evolucionar la tabla "asistencia_alumnos" para que cada fila represente el
--   aporte INDEPENDIENTE de UN profesor:
--
--     (profesor_clave, curp, grado, grupo, fecha) → clases_asistidas
--
--   Esto permite que varios profesores actualicen su propio aporte mediante
--   UPSERT sin acumular ni sobrescribir el aporte de otro profesor.
--
-- SEGURIDAD:
--   · NO borra la tabla.
--   · NO recrea la tabla.
--   · NO pierde datos (la tabla está vacía, pero la migración es correcta
--     para producción: agrega la columna con valor por defecto y luego la
--     vuelve NOT NULL).
--   · Conserva los CHECK existentes (clases_asistidas >= 0).
--   · Conserva los índices útiles y ajusta la UNIQUE.
-- ============================================================================

-- 1) Agregar la columna profesor_clave (nullable primero para no romper filas
--    existentes; la tabla está vacía, pero así la migración es segura).
ALTER TABLE "asistencia_alumnos"
  ADD COLUMN IF NOT EXISTS profesor_clave text;

-- 2) Poblar profesor_clave en filas existentes (si las hubiera) con un valor
--    neutro para poder aplicar NOT NULL. Como la tabla está vacía, no afecta
--    datos reales; en producción con datos previos habría que decidir el valor.
UPDATE "asistencia_alumnos"
  SET profesor_clave = 'SIN_PROFESOR'
  WHERE profesor_clave IS NULL;

-- 3) Volver la columna NOT NULL.
ALTER TABLE "asistencia_alumnos"
  ALTER COLUMN profesor_clave SET NOT NULL;

-- 4) Eliminar la UNIQUE anterior (curp, grado, grupo, fecha).
ALTER TABLE "asistencia_alumnos"
  DROP CONSTRAINT IF EXISTS asistencia_alumnos_unico;

-- 5) Crear la nueva UNIQUE (profesor_clave, curp, grado, grupo, fecha).
--    Esta es la identidad lógica del aporte de un profesor.
ALTER TABLE "asistencia_alumnos"
  ADD CONSTRAINT asistencia_alumnos_unico
  UNIQUE (profesor_clave, curp, grado, grupo, fecha);

-- 6) Índice para consultar la asistencia global de un alumno (perfil
--    alumno/padre): SUM(clases_asistidas) por curp + fecha.
CREATE INDEX IF NOT EXISTS asistencia_alumnos_curp_fecha_idx
  ON "asistencia_alumnos" (curp, fecha);

-- 7) Índice para consultar la asistencia de todo un grupo en una fecha
--    (reportes del directivo): SUM por grado + grupo + fecha.
CREATE INDEX IF NOT EXISTS asistencia_alumnos_grupo_fecha_idx
  ON "asistencia_alumnos" (grado, grupo, fecha);

-- 8) Índice para consultar el aporte de un profesor concreto en un grupo
--    (validación al subir plantilla): profesor_clave + grado + grupo + fecha.
CREATE INDEX IF NOT EXISTS asistencia_alumnos_profesor_grupo_idx
  ON "asistencia_alumnos" (profesor_clave, grado, grupo, fecha);

-- ============================================================================
-- NOTA SOBRE EL TOTAL GLOBAL Y EL PORCENTAJE (datos derivados, NO se guardan)
-- ============================================================================
--   Total de clases del grupo para una fecha:
--     SELECT COALESCE(SUM(clases), 0) FROM "clases_impartidas"
--     WHERE grado = $1 AND grupo = $2 AND fecha = $3;
--
--   Asistencia real de un alumno en una fecha (suma de aportes de profesores):
--     SELECT COALESCE(SUM(clases_asistidas), 0) FROM "asistencia_alumnos"
--     WHERE curp = $1 AND grado = $2 AND grupo = $3 AND fecha = $4;
--
--   Porcentaje:
--     asistencia_real / total_clases_grupo
--
--   Ambos se calculan en el momento de la consulta; nunca se almacenan, lo que
--   garantiza consistencia si un profesor cambia su aporte (3 → 4).
-- ============================================================================
