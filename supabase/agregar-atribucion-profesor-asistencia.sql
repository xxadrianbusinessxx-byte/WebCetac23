-- ============================================================================
-- agregar-atribucion-profesor-asistencia.sql  (Prompt C — R-1)
-- ----------------------------------------------------------------------------
-- ATRIBUCIÓN DE MATERIA AL PROFESOR EN ASISTENCIAS (profesor_id + grupo_materia_id)
--
-- Qué hace (ADITIVO · IDEMPOTENTE · NO destructivo · NO borra filas):
--   1) Garantiza `profesor_id smallint` en clases_impartidas y
--      asistencia_alumnos (si Prompt B lo dejó como integer, se reconcilia a
--      smallint para poder crear la FK contra public."PROFESORES"."ID").
--   2) Añade `grupo_materia_id uuid` en ambas tablas.
--   3) RELAJA el NOT NULL de `profesor_clave` (legacy): la columna y la UNIQUE
--      existentes se CONSERVAN, pero las escrituras NUEVAS ya no escriben la
--      contraseña como identidad (motivo de fondo del Prompt C): su valor pasa
--      a NULL y la identidad es `profesor_id`. Las filas históricas NO se
--      tocan (sin backfill; autoría irrecuperable).
--   4) FK reales donde NO existan y SOLO si no hay filas huérfanas. Si las
--      hay, el script las REPORTA (RAISE NOTICE) y NO crea esa FK.
--   5) ÍNDICE ÚNICO nuevo por materia (arbiter del UPSERT del código):
--        clases_impartidas (profesor_id, grupo_materia_id, grado, grupo, fecha)
--        asistencia_alumnos (profesor_id, grupo_materia_id, curp, grado, grupo, fecha)
--      Permite «2 materias del mismo grupo y día» (2 filas) y re-subir la
--      misma materia sin duplicar (idempotencia). Como las filas nuevas
--      SIEMPRE llevan profesor_id + grupo_materia_id NO NULL, el índice es de
--      columnas planas (arbiter válido para ON CONFLICT de PostgREST). Las
--      filas legacy (profesor_id NULL) quedan fuera de la colisión por la
--      semántica NULL-distinct de Postgres.
--
-- DECISIÓN DOCUMENTADA (motiva el punto 3 y se explica en el informe C):
--   Conservar la UNIQUE full legacy (profesor_clave, grado, grupo, fecha)
--   haría IMPOSIBLE 2 materias del mismo profesor/grupo/día (columna NOT NULL
--   compartida). Relajar el NOT NULL conserva la columna y la UNIQUE para las
--   filas legacy y deja libre el espacio de las nuevas, que se gobiernan por
--   la UNIQUE con materia. Nada destructivo: sin DROP de columna, sin DROP de
--   constraint existente, sin DELETE.
--
-- NO ejecutar desde la app: correr en el SQL Editor de Supabase.
-- Re-ejecutable sin errores.
-- ============================================================================

-- ============================================================================
-- 1) COLUMNAS DE IDENTIDAD Y ATRIBUCIÓN
-- ============================================================================

-- 1a) profesor_id smallint (== public."PROFESORES"."ID").
ALTER TABLE public.clases_impartidas
  ADD COLUMN IF NOT EXISTS profesor_id smallint;
ALTER TABLE public.asistencia_alumnos
  ADD COLUMN IF NOT EXISTS profesor_id smallint;

-- Si Prompt B ya lo creó como integer, reconciliar el tipo a smallint
-- (cast seguro: PROFESORES.ID es smallint y los valores son bajos).
DO $$
DECLARE
  v_col record;
BEGIN
  FOR v_col IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('clases_impartidas', 'asistencia_alumnos')
      AND column_name = 'profesor_id'
      AND data_type <> 'smallint'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN profesor_id TYPE smallint USING profesor_id::smallint',
      v_col.table_name
    );
    RAISE NOTICE 'profesor_id reconciliado a smallint en %', v_col.table_name;
  END LOOP;
END $$;

-- 1b) grupo_materia_id uuid (grupo_materias.id).
ALTER TABLE public.clases_impartidas
  ADD COLUMN IF NOT EXISTS grupo_materia_id uuid;
ALTER TABLE public.asistencia_alumnos
  ADD COLUMN IF NOT EXISTS grupo_materia_id uuid;

-- ============================================================================
-- 2) `profesor_clave` DEJA DE SER OBLIGATORIA (legacy).
--    Se conserva la columna y sus UNIQUE; las filas NUEVAS usan profesor_id.
-- ============================================================================

DO $$
BEGIN
  ALTER TABLE public.clases_impartidas
    ALTER COLUMN profesor_clave DROP NOT NULL;
  ALTER TABLE public.asistencia_alumnos
    ALTER COLUMN profesor_clave DROP NOT NULL;
  RAISE NOTICE 'profesor_clave pasa a nullable (legacy): las escrituras nuevas usan profesor_id.';
END $$;


-- ============================================================================
-- 3) FK REALES (SOLO si no existen y no dejan huérfanos)
--    Cada FK se reporta si no se crea por filas huérfanas; NUNCA borra filas.
-- ============================================================================

DO $$
DECLARE
  v_fk record;
  v_equivalente boolean;
  v_huerfanos bigint;
BEGIN
  FOR v_fk IN
    SELECT 'clases_impartidas' AS tabla, 'profesor_id' AS col,
           'PROFESORES' AS ref, 'ID' AS refcol,
           'clases_impartidas_profesor_id_fk' AS nombre
    UNION ALL SELECT 'clases_impartidas', 'grupo_materia_id', 'grupo_materias', 'id',
           'clases_impartidas_grupo_materia_id_fk'
    UNION ALL SELECT 'clases_impartidas', 'periodo_id', 'periodos', 'id',
           'clases_impartidas_periodo_id_fk'
    UNION ALL SELECT 'clases_impartidas', 'periodo_evaluacion_id', 'periodos_evaluacion', 'id',
           'clases_impartidas_periodo_evaluacion_id_fk'
    UNION ALL SELECT 'asistencia_alumnos', 'profesor_id', 'PROFESORES', 'ID',
           'asistencia_alumnos_profesor_id_fk'
    UNION ALL SELECT 'asistencia_alumnos', 'grupo_materia_id', 'grupo_materias', 'id',
           'asistencia_alumnos_grupo_materia_id_fk'
    UNION ALL SELECT 'asistencia_alumnos', 'curp', 'ALUMNOS', 'CURP',
           'asistencia_alumnos_curp_fk'
    UNION ALL SELECT 'asistencia_alumnos', 'periodo_id', 'periodos', 'id',
           'asistencia_alumnos_periodo_id_fk'
    UNION ALL SELECT 'asistencia_alumnos', 'periodo_evaluacion_id', 'periodos_evaluacion', 'id',
           'asistencia_alumnos_periodo_evaluacion_id_fk'
  LOOP
    -- La columna debe existir (p. ej. periodo_id podría no estar aplicado aún).
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = v_fk.tabla
        AND column_name = v_fk.col
    );

    -- a) ¿Ya existe una FK equivalente (cualquier nombre)?
    SELECT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class ct ON ct.oid = con.conrelid
      JOIN pg_namespace nt ON nt.oid = ct.relnamespace
      JOIN pg_class rt ON rt.oid = con.confrelid
      JOIN pg_namespace nr ON nr.oid = rt.relnamespace
      WHERE con.contype = 'f'
        AND nt.nspname = 'public' AND ct.relname = v_fk.tabla
        AND nr.nspname = 'public' AND rt.relname = v_fk.ref
        AND EXISTS (
          SELECT 1 FROM unnest(con.conkey) k
          JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k
          WHERE ca.attname = v_fk.col
        )
    ) INTO v_equivalente;

    IF v_equivalente THEN
      RAISE NOTICE 'FK equivalente ya existe: %.% → %.% → no se crea duplicado.',
        v_fk.tabla, v_fk.col, v_fk.ref, v_fk.refcol;
      CONTINUE;
    END IF;

    -- b) ¿Conflicto de nombre (misma constraint con otra definición)?
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = v_fk.nombre
        AND conrelid = format('public.%I', v_fk.tabla)::regclass
    ) THEN
      RAISE NOTICE 'Conflicto de nombre %: se revisa manualmente; NO se elimina nada.', v_fk.nombre;
      CONTINUE;
    END IF;

    -- c) ¿Filas huérfanas? Si las hay: REPORTAR y no crear la FK.
    EXECUTE format(
      'SELECT count(*) FROM public.%I t
         WHERE t.%I IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.%I r WHERE r.%I = t.%I)',
      v_fk.tabla, v_fk.col, v_fk.ref, v_fk.refcol, v_fk.col
    ) INTO v_huerfanos;

    IF v_huerfanos > 0 THEN
      RAISE NOTICE 'FK NO creada % (%.% → %.%): % filas huérfanas. Revisar datos; no se borra nada.',
        v_fk.nombre, v_fk.tabla, v_fk.col, v_fk.ref, v_fk.refcol, v_huerfanos;
      CONTINUE;
    END IF;

    -- d) Crear la FK.
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD CONSTRAINT %I FOREIGN KEY (%I)
         REFERENCES public.%I (%I) ON DELETE RESTRICT',
      v_fk.tabla, v_fk.nombre, v_fk.col, v_fk.ref, v_fk.refcol
    );
    RAISE NOTICE 'FK creada: %.% → %.% (%)', v_fk.tabla, v_fk.col, v_fk.ref, v_fk.refcol, v_fk.nombre;
  END LOOP;
END $$;

-- ============================================================================
-- 4) ÍNDICE ÚNICO NUEVO POR MATERIA (arbiter del UPSERT del código C)
--    Las filas legacy (profesor_id NULL) NO colisionan (NULL-distinct). Las
--    filas nuevas SIEMPRE llevan profesor_id + grupo_materia_id NOT NULL, de
--    modo que:
--      · 2 materias del mismo profesor/grupo/fecha → 2 filas (gm distinto);
--      · re-subir la misma materia del mismo grupo/fecha → misma fila
--        (actualización, nunca duplicado).
--    Son índices de COLUMNAS PLANAS (no expresión/parciales) porque
--    PostgREST/supabase-js resuelve `onConflict` por lista de columnas.
-- ============================================================================

-- Índices de apoyo (búsquedas nuevas).
CREATE INDEX IF NOT EXISTS ix_clases_impartidas_profesor_materia
  ON public.clases_impartidas (profesor_id, grupo_materia_id);
CREATE INDEX IF NOT EXISTS ix_asistencia_alumnos_profesor_materia
  ON public.asistencia_alumnos (profesor_id, grupo_materia_id);

-- UNIQUE con materia (guardas idempotentes por equivalencia).
DO $$
DECLARE
  v_idx record;
  v_equivalente boolean;
BEGIN
  FOR v_idx IN
    SELECT 'clases_impartidas' AS tabla,
           ARRAY['profesor_id','grupo_materia_id','grado','grupo','fecha'] AS cols,
           'clases_impartidas_profesor_materia_uidx' AS nombre
    UNION ALL SELECT 'asistencia_alumnos',
           ARRAY['profesor_id','grupo_materia_id','curp','grado','grupo','fecha'],
           'asistencia_alumnos_profesor_materia_uidx'
  LOOP
    -- ¿Ya existe un índice UNIQUE equivalente con esas columnas (cualquier nombre)?
    SELECT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_idx.tabla
        AND i.indisunique
        AND array_length(i.indkey, 1) = array_length(v_idx.cols, 1)
        AND (
          SELECT array_agg(a.attname ORDER BY u.ord)::text
          FROM unnest(i.indkey) WITH ORDINALITY u(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
        ) = (SELECT array_to_string(v_idx.cols, ','))
    ) INTO v_equivalente;

    IF v_equivalente THEN
      RAISE NOTICE 'Ya existe índice UNIQUE equivalente en % → no se crea duplicado.', v_idx.tabla;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_idx.nombre
    ) THEN
      RAISE NOTICE 'Conflicto de nombre %: revisar manualmente; NO se elimina nada.', v_idx.nombre;
      CONTINUE;
    END IF;

    EXECUTE format(
      'CREATE UNIQUE INDEX %I ON public.%I (%s)',
      v_idx.nombre,
      v_idx.tabla,
      (SELECT string_agg(quote_ident(c), ', ') FROM unnest(v_idx.cols) c)
    );
    RAISE NOTICE 'Índice UNIQUE creado: % (%s)', v_idx.nombre, v_idx.tabla;
  END LOOP;
END $$;

-- ============================================================================
-- NOTAS FINALES / ROLLBACK documentado (no automático)
-- ----------------------------------------------------------------------------
--   · El código de asistencias (Prompt C) exige esquema con ambas columnas;
--     si aún no están, confirmarAsistencias responde error controlado y NO
--     escribe con la contraseña.
--   · Verificación sugerida después de ejecutar:
--       SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--        WHERE conrelid IN ('clases_impartidas'::regclass,'asistencia_alumnos'::regclass)
--          AND contype = 'f';
--   · ROLLBACK (si se requiere, NO automático):
--       ALTER TABLE public.clases_impartidas DROP COLUMN IF EXISTS grupo_materia_id;
--       ALTER TABLE public.asistencia_alumnos DROP COLUMN IF EXISTS grupo_materia_id;
--       ALTER TABLE public.clases_impartidas ALTER COLUMN profesor_clave SET NOT NULL;
--       ALTER TABLE public.asistencia_alumnos ALTER COLUMN profesor_clave SET NOT NULL;
--     (profesor_id se conserva; su FK queda vigente para las filas nuevas.)
-- ============================================================================

