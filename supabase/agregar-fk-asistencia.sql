-- ============================================================================
-- agregar-fk-asistencia.sql  (PROMPT-1 — T5 / B4)
-- ----------------------------------------------------------------------------
-- FKs REALES de `clases_impartidas` y `asistencia_alumnos` hacia las tablas de
-- identidad del catálogo. Convierte en IMPOSIBLES los estados que hoy la base
-- acepta (huérfanos por valor) y hace fiable la cascada al borrar un ciclo.
--
-- Estado medido (2026-09-06, `probe-columnas-asistencia.mjs`):
--   0 filas huérfanas en las 9 relaciones. Las FK YA existen en producción
--   (aplicadas por el R-1 del Prompt C); este archivo las VERSIONA de forma
--   aditiva e idempotente: solo crea las que falten, nunca duplica ni borra.
--
-- ADITIVO · IDEMPOTENTE · NO destructivo. Ejecutar en el SQL Editor de
-- Supabase. Re-ejecutable sin errores.
-- ============================================================================

-- Tabla auxiliar de trabajo (se elimina al final).
DO $$
DECLARE
  v_fk record;
BEGIN
  FOR v_fk IN
    SELECT
      'clases_impartidas'  AS tabla, 'profesor_id'          AS col,
      'PROFESORES'         AS ref,   'ID'                   AS refcol, 'clases_impartidas_profesor_id_fkey'   AS nombre
    UNION ALL SELECT 'clases_impartidas',  'grupo_materia_id',       'grupo_materias',      'id', 'clases_impartidas_grupo_materia_id_fkey'
    UNION ALL SELECT 'clases_impartidas',  'periodo_id',             'periodos',            'id', 'clases_impartidas_periodo_id_fkey'
    UNION ALL SELECT 'clases_impartidas',  'periodo_evaluacion_id',  'periodos_evaluacion', 'id', 'clases_impartidas_periodo_evaluacion_id_fkey'
    UNION ALL SELECT 'asistencia_alumnos', 'profesor_id',            'PROFESORES',          'ID', 'asistencia_alumnos_profesor_id_fkey'
    UNION ALL SELECT 'asistencia_alumnos', 'grupo_materia_id',       'grupo_materias',      'id', 'asistencia_alumnos_grupo_materia_id_fkey'
    UNION ALL SELECT 'asistencia_alumnos', 'curp',                   'ALUMNOS',             'CURP', 'asistencia_alumnos_curp_fkey'
    UNION ALL SELECT 'asistencia_alumnos', 'periodo_id',             'periodos',            'id', 'asistencia_alumnos_periodo_id_fkey'
    UNION ALL SELECT 'asistencia_alumnos', 'periodo_evaluacion_id',  'periodos_evaluacion', 'id', 'asistencia_alumnos_periodo_evaluacion_id_fkey'
  LOOP
    -- ¿Ya existe una FK sobre ESA columna (cualquier nombre)?
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = format('public.%I', v_fk.tabla)::regclass
        AND c.contype = 'f'
        AND a.attname = v_fk.col
    ) THEN
      RAISE NOTICE 'Ya existe una FK sobre %.% → no se duplica.', v_fk.tabla, v_fk.col;
      CONTINUE;
    END IF;
    -- Defensa: si la columna o la referencia no existen, se reporta y se omite.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_fk.tabla AND column_name = v_fk.col
    ) THEN
      RAISE NOTICE 'Columna %.% no existe → FK % omitida.', v_fk.tabla, v_fk.col, v_fk.nombre;
      CONTINUE;
    END IF;
    -- Ejecuta la FK (solo si no hay huérfanos la creación tendría éxito; si la
    -- hubiera, Postgres aborta y el RAISE NOTICE del bloque EXCEPTION lo deja
    -- documentado sin abortar el resto del archivo).
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (%I)',
        v_fk.tabla, v_fk.nombre, v_fk.col, v_fk.ref, v_fk.refcol
      );
      RAISE NOTICE 'FK creada: % (%.% → %.%)', v_fk.nombre, v_fk.tabla, v_fk.col, v_fk.ref, v_fk.refcol;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'FK % NO creada: %', v_fk.nombre, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- ROLLBACK (documentado, NO automático):
--   ALTER TABLE public.clases_impartidas  DROP CONSTRAINT IF EXISTS ..._fkey;
--   ALTER TABLE public.asistencia_alumnos DROP CONSTRAINT IF EXISTS ..._fkey;
-- ============================================================================
