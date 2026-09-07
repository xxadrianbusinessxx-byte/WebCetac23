-- ============================================================================
-- agregar-indices-asistencia.sql  (PROMPT-1 — T6 / B2)
-- ----------------------------------------------------------------------------
-- Índices para el volumen real de asistencia (proyección ~345 000 filas por
-- semestre, que para Postgres es pequeño: el problema no es volumen sino
-- índices ausentes y periodo_id sin rellenar).
--
-- NO se crean tablas físicas por materia para la asistencia (decisión ya
-- tomada, no re-decidir): la asistencia es uniforme y se consulta cruzada (por
-- alumno, grupo, profesor y parcial).
--
-- Qué añade (ADITIVO · IDEMPOTENTE · NO destructivo):
--   1) (periodo_id, grupo_materia_id, fecha)  — consulta de grupo por parcial
--      y por materia.
--   2) (curp, periodo_id)                     — histórico del alumno (perfil).
--   3) UNIQUE (curp, grupo_materia_id, fecha) — UN registro por alumno, clase
--      y día. Nota: los NULL de grupo_materia_id (filas históricas sin materia)
--      quedan fuera de la colisión por la semántica NULL-distinct de Postgres.
--
-- Ejecutar en el SQL Editor de Supabase. Re-ejecutable sin errores.
-- ============================================================================

-- 1) Consulta de grupo por parcial / materia.
CREATE INDEX IF NOT EXISTS asistencia_alumnos_periodo_gm_fecha_idx
  ON public.asistencia_alumnos (periodo_id, grupo_materia_id, fecha);

CREATE INDEX IF NOT EXISTS clases_impartidas_periodo_gm_fecha_idx
  ON public.clases_impartidas (periodo_id, grupo_materia_id, fecha);

-- 2) Histórico del alumno (perfil: todas sus clases por ciclo).
CREATE INDEX IF NOT EXISTS asistencia_alumnos_curp_periodo_idx
  ON public.asistencia_alumnos (curp, periodo_id);

-- 3) UNIQUE por alumno + clase + día (un registro por alumno, clase y día).
--    Guarda idempotente por equivalencia: si ya existe un índice único con esas
--    columnas (cualquier nombre), no se duplica.
DO $$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'asistencia_alumnos'
      AND i.indisunique
      AND (
        SELECT array_agg(a.attname ORDER BY u.ord)::text
        FROM unnest(i.indkey) WITH ORDINALITY u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
      ) = 'curp,grupo_materia_id,fecha'
  ) INTO v_existe;

  IF NOT v_existe AND NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'asistencia_alumnos_curp_gm_fecha_uidx'
  ) THEN
    CREATE UNIQUE INDEX asistencia_alumnos_curp_gm_fecha_uidx
      ON public.asistencia_alumnos (curp, grupo_materia_id, fecha);
    RAISE NOTICE 'Índice único creado: asistencia_alumnos_curp_gm_fecha_uidx';
  ELSE
    RAISE NOTICE 'Índice único equivalente ya existe → no se duplica.';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (documentado, NO automático):
--   DROP INDEX IF EXISTS public.asistencia_alumnos_periodo_gm_fecha_idx;
--   DROP INDEX IF EXISTS public.clases_impartidas_periodo_gm_fecha_idx;
--   DROP INDEX IF EXISTS public.asistencia_alumnos_curp_periodo_idx;
--   DROP INDEX IF EXISTS public.asistencia_alumnos_curp_gm_fecha_uidx;
-- ============================================================================
