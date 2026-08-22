-- ============================================================================
-- CONFIGURACIÓN DE CLASES DEL PROFESOR — BLOQUE 5C
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Guardar cuántas clases imparte cada profesor por DÍA DE LA SEMANA
--   (lunes a viernes). Esto NO es asistencia: es la cantidad de clases que el
--   profesor imparte en cada día. La plantilla de asistencias usa esta
--   configuración para auto-rellenar la fila CLASES según el día real de cada
--   fecha del calendario escolar.
--
-- SEGURIDAD:
--   · CREATE TABLE IF NOT EXISTS (idempotente, seguro de re-ejecutar).
--   · NO toca tablas existentes (ALUMNOS, PROFESORES, ETIQUETAS PERSONALES,
--     calendario_escolar, clases_impartidas, asistencia_alumnos).
--   · UNIQUE (profesor_clave): un profesor tiene UNA sola configuración.
--   · CHECK (>= 0) en cada día: nunca clases negativas.
--   · UPSERT por profesor_clave: guardar de nuevo actualiza, no duplica.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "configuracion_clases_profesor" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_clave text NOT NULL,          -- CLAVE/MATRÍCULA del profesor (identidad estable)
  lunes integer NOT NULL DEFAULT 0 CHECK (lunes >= 0),
  martes integer NOT NULL DEFAULT 0 CHECK (martes >= 0),
  miercoles integer NOT NULL DEFAULT 0 CHECK (miercoles >= 0),
  jueves integer NOT NULL DEFAULT 0 CHECK (jueves >= 0),
  viernes integer NOT NULL DEFAULT 0 CHECK (viernes >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Un profesor solo tiene UNA configuración de clases por semana.
  CONSTRAINT configuracion_clases_profesor_unico UNIQUE (profesor_clave)
);

-- Índice para consultar la configuración de un profesor por su clave.
CREATE INDEX IF NOT EXISTS configuracion_clases_profesor_clave_idx
  ON "configuracion_clases_profesor" (profesor_clave);

-- ============================================================================
-- NOTA ARQUITECTÓNICA
-- ============================================================================
--   · La configuración es OPCIONAL: si un profesor aún no la tiene, la
--     plantilla se genera con la fila CLASES vacía y la UI le indica que debe
--     configurarla para que la plantilla se auto-rellene.
--   · La asistencia real del alumno (asistencia_alumnos.clases_asistidas) es
--     un concepto DISTINTO de las clases impartidas (clases_impartidas.clases).
--     Esta tabla solo alimenta la generación automática de la fila CLASES.
--   · No se almacena ningún dato derivado (totales, porcentajes).
-- ============================================================================
