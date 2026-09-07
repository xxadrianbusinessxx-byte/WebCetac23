-- ============================================================================
-- agregar-grupo-materia-justificaciones.sql  (PROMPT 1 — T1 / A1)
-- ----------------------------------------------------------------------------
-- JUSTIFICACIÓN POR CLASE CON IDENTIDAD ESTRUCTURAL (grupo_materia_id uuid)
--
-- SUPERSEDE a supabase/agregar-materia-justificaciones.sql (que nunca se
-- ejecutó). Diferencia con la decisión del Prompt B:
--   · Prompt B pedía `materia_clave text` (identificador de texto NUEVO).
--   · PROMPT-1 (decisión ya tomada, no re-decidir) usa `grupo_materia_id uuid`
--     → la misma relación que `clases_impartidas` y `asistencia_alumnos` ya
--     usan con 0 huérfanos. Un identificador de texto más violaría R5.
--
-- Qué hace (ADITIVO · IDEMPOTENTE · NO destructivo · NO borra filas):
--   1) Añade `grupo_materia_id uuid` → FK a grupo_materias(id) ON DELETE
--      CASCADE. NULL = justificación de DÍA COMPLETO (comportamiento actual).
--   2) Retira la UNIQUE `(curp_alumno, fecha)` previa (índice o constraint,
--      cualquiera de los nombres conocidos) porque ya no puede gobernar el
--      espacio: una por clase necesita varias filas por alumno+fecha.
--   3) Dos UNIQUE parciales (en Postgres los NULL son distintos entre sí,
--      por eso no basta una UNIQUE de columnas planas):
--        · (curp_alumno, fecha)              WHERE grupo_materia_id IS NULL
--            → UNA justificación de día completo por alumno y fecha;
--        · (curp_alumno, fecha, grupo_materia_id) WHERE grupo_materia_id
--          IS NOT NULL → UNA por clase concreta.
--      La regla «o día entero, o clases sueltas, nunca dos veces lo mismo»
--      queda expresada en la base, no en TypeScript.
--
-- Re-ejecutable sin errores. Ejecutar en el SQL Editor de Supabase.
-- ROLLBACK (documentado, no automático) al final del archivo.
-- ============================================================================

-- 1) Columna estructural nullable (NULL = día completo).
ALTER TABLE public.justificaciones_asistencia
  ADD COLUMN IF NOT EXISTS grupo_materia_id uuid
  REFERENCES public.grupo_materias(id) ON DELETE CASCADE;

-- 2) Retirar la unicidad previa (curp_alumno, fecha). Se cubren los nombres
--    conocidos (índice base, índice del Prompt B no aplicado y constraint del
--    Prompt B) sin asumir cuál existe hoy.

-- 2a) Índice creado por supabase/crear-tablas-justificaciones.sql.
DROP INDEX IF EXISTS public.justificaciones_curp_fecha_key;

-- 2b) Índice del Prompt B (si alguna vez se aplicó a medias).
DROP INDEX IF EXISTS public.justificaciones_asistencia_curp_fecha_materia_unique;

-- 2c) Constraint con nombre del Prompt B (si existe como constraint).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.justificaciones_asistencia'::regclass
      AND conname = 'justificaciones_asistencia_curp_alumno_fecha_key'
  ) THEN
    ALTER TABLE public.justificaciones_asistencia
      DROP CONSTRAINT justificaciones_asistencia_curp_alumno_fecha_key;
  END IF;
END $$;

-- 3) Índices de apoyo (lecturas nuevas por alumno/fecha).
CREATE INDEX IF NOT EXISTS justificaciones_asistencia_curp_fecha_idx
  ON public.justificaciones_asistencia (curp_alumno, fecha);

-- 4) Las dos UNIQUE parciales (regla de negocio en la base).
CREATE UNIQUE INDEX IF NOT EXISTS justificaciones_dia_completo_uidx
  ON public.justificaciones_asistencia (curp_alumno, fecha)
  WHERE grupo_materia_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS justificaciones_por_clase_uidx
  ON public.justificaciones_asistencia (curp_alumno, fecha, grupo_materia_id)
  WHERE grupo_materia_id IS NOT NULL;

-- ============================================================================
-- ROLLBACK (documentado, NO automático):
--   DROP INDEX IF EXISTS public.justificaciones_por_clase_uidx;
--   DROP INDEX IF EXISTS public.justificaciones_dia_completo_uidx;
--   DROP INDEX IF EXISTS public.justificaciones_asistencia_curp_fecha_idx;
--   ALTER TABLE public.justificaciones_asistencia
--     DROP COLUMN IF EXISTS grupo_materia_id;
--   CREATE UNIQUE INDEX justificaciones_curp_fecha_key
--     ON public.justificaciones_asistencia (curp_alumno, fecha);
-- ============================================================================
