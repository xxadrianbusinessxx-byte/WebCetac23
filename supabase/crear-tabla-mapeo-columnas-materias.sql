-- ============================================================================
-- MAPEO DE COLUMNAS DE CALIFICACIONES POR MATERIA — BLOQUE 7C
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Guardar la configuración explícita de qué columnas del Excel representan
--   la identidad del alumno, CURP, actividades, parciales, promedio,
--   calificación final y columnas a ocultar al alumno.
--
--   Es EXCLUSIVAMENTE METADATOS DE PRESENTACIÓN: NO modifica la estructura de
--   las tablas de materias, NO renombra columnas físicas, NO mueve datos.
--   La materia se identifica por su idInterno real (materia_id = nombre
--   exacto de la tabla Supabase).
--
-- SEGURIDAD:
--   · CREATE TABLE IF NOT EXISTS (idempotente, seguro de re-ejecutar).
--   · UNIQUE (materia_id): una sola configuración por materia; re-guardar
--     actualiza (UPSERT), nunca duplica.
--   · El control de roles se hace en la capa de aplicación (Server Actions):
--     solo «maestro» y «directivo» pueden escribir.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "materias_mapeo_columnas" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id text NOT NULL,                     -- idInterno real (nombre exacto de la tabla)
  columnas_nombre_alumno text[] NOT NULL DEFAULT '{}',  -- 1..N columnas que forman el nombre (en orden)
  columna_curp text,                            -- columna CURP (opcional)
  columnas_actividades text[] NOT NULL DEFAULT '{}',
  columnas_parciales text[] NOT NULL DEFAULT '{}',
  columna_promedio text,                        -- columna de promedio (opcional)
  columna_final text,                           -- columna de calificación final (opcional)
  columnas_ocultas text[] NOT NULL DEFAULT '{}',-- columnas que el alumno NO ve (no se eliminan)
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  actualizado_por text,                         -- matrícula de quien guardó
  CONSTRAINT materias_mapeo_columnas_unico UNIQUE (materia_id)
);

CREATE INDEX IF NOT EXISTS materias_mapeo_columnas_materia_id_idx
  ON "materias_mapeo_columnas" (materia_id);

-- ============================================================================
-- NOTA ARQUITECTÓNICA
-- ============================================================================
--   · La tabla de materia y sus columnas físicas permanecen EXACTAS.
--   · La configuración referencia los nombres reales de columna (texto del
--     encabezado del Excel tal como se guarda en Supabase).
--   · Sin fila para una materia → se usa la detección automática del
--     BLOQUE 7B (compatibilidad total).
-- ============================================================================
