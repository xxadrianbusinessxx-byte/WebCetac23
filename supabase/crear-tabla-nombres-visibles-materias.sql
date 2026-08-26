-- ============================================================================
-- NOMBRES VISIBLES DE MATERIAS — BLOQUE 7A
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- OBJETIVO:
--   Guardar únicamente el NOMBRE VISIBLE (presentación) de cada materia.
--   El identificador técnico real (materia_id) es el nombre EXACTO de la
--   tabla Supabase donde viven las calificaciones (ej. «2DO A MECATRONICA
--   CONCIENCIA HISTORICA») y NUNCA se renombra.
--
--   Esta tabla NO duplica calificaciones ni materias: es configuración
--   ligera de presentación. El fallback (sin fila) es mostrar el nombre
--   técnico actual, por lo que no hace falta cargar aliases de todas las
--   materias.
--
-- SEGURIDAD:
--   · CREATE TABLE IF NOT EXISTS (idempotente, seguro de re-ejecutar).
--   · UNIQUE (materia_id): un solo nombre visible por materia.
--   · CHECK: nombre_visible entre 1 y 120 caracteres (después de trim).
--   · NO toca tablas de calificaciones ni esquemas existentes.
--   · El control de roles se hace en la capa de aplicación (Server Actions):
--     solo rol «directivo» puede escribir.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "materias_nombres_visibles" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id text NOT NULL,               -- identificador técnico real (nombre exacto de la tabla)
  nombre_visible text NOT NULL,           -- nombre de presentación (trim, 1..120)
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  actualizado_por text,                   -- matrícula del directivo que guardó
  CONSTRAINT materias_nombres_visibles_len CHECK (
    char_length(btrim(nombre_visible)) BETWEEN 1 AND 120
  ),
  CONSTRAINT materias_nombres_visibles_unico UNIQUE (materia_id)
);

CREATE INDEX IF NOT EXISTS materias_nombres_visibles_materia_id_idx
  ON "materias_nombres_visibles" (materia_id);

-- ============================================================================
-- NOTA ARQUITECTÓNICA
-- ============================================================================
--   · materia_id = identificador técnico REAL (nombre exacto de la tabla).
--   · La granularidad actual es por tabla (cada materia con su alias).
--     Si en el futuro se quiere un nombre visible global por asignatura, se
--     agrega una capa de resolución independiente SIN migrar esta tabla ni
--     las tablas de calificaciones.
--   · El nombre visible NUNCA debe usarse para acceder a Supabase.
-- ============================================================================
