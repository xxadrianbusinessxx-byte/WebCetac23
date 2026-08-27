-- ============================================================================
-- C4.11 / C4.13.2 / C4.13.4 — MIGRACIÓN ESTRUCTURAL DE ASIGNACIONES DE PROFESOR
--
-- Objetivo: preparar `asignaciones_profesor` para la identidad estructural
--
--     asignaciones_profesor.profesor_id  SMALLINT
--          ↓
--     public."PROFESORES".ID             (smallint · NOT NULL · PRIMARY KEY)
--          ↓
--     grupo_materia_id → grupo_materias → materia/grupo/tabla_legacy
--
-- AUDITORÍA DIRECTA (C4.13.4):
--   * public."PROFESORES"."ID" es SMALLINT NOT NULL con PRIMARY KEY
--     "PROFESORES_pkey" (indisprimary = true, indisunique = true). Válida.
--   * `profesor_id` se crea como SMALLINT para coincidir EXACTAMENTE con
--     "PROFESORES"."ID" (evita cast innecesario en la FK).
--   * FK explícita, sin descubrimiento dinámico de la PK:
--       FOREIGN KEY (profesor_id)
--       REFERENCES public."PROFESORES" ("ID")
--   * CORRECCIÓN C4.13.4: la versión anterior escribía REFERENCES (ID) sin
--     comillas dobles; PostgreSQL lo dobla a minúsculas (id) y la columna real
--     es "ID" (mayúsculas) → error 42703 en la FK. Ahora la referencia va
--     entre comillas dobles: ("ID").
--
-- Conservando `profesor_clave` como compatibilidad/histórico (asistencia y
-- código legacy aún la usan; su migración es una fase independiente).
--
-- COMPLETAMENTE IDEMPOTENTE (re-ejecutable sin errores):
--   * ADD COLUMN IF NOT EXISTS profesor_id smallint.
--   * FK: se comprueba en pg_catalog si YA existe una FK equivalente
--     (profesor_id → PROFESORES."ID", cualquier nombre); si existe, no se
--     crea. Si el nombre objetivo existe con otra definición, se reporta
--     conflicto (RAISE EXCEPTION) y NO se destruye nada.
--   * Índice normal IF NOT EXISTS.
--   * Índice UNIQUE PARCIAL anti-duplicados con detección de equivalente.
--
-- NO crea asignaciones (COUNT(asignaciones_profesor) permanece = 0).
-- NO modifica PROFESORES, grupo_materias, asistencia, boleta, ETIQUETAS,
-- calificaciones, alumnos, RLS ni datos existentes.
-- ============================================================================

-- 1) Columna de identidad estructural. SMALLINT para coincidir con
--    public."PROFESORES"."ID". Nullable: las filas legacy solo tienen
--    profesor_clave; NOT NULL se evaluará cuando exista cobertura real.
ALTER TABLE public.asignaciones_profesor
  ADD COLUMN IF NOT EXISTS profesor_id smallint;

-- 2) FK → public."PROFESORES"("ID") con GUARD IDEMPOTENTE.
--    a) Si ya existe una FK equivalente (cualquier nombre, apuntando a
--       PROFESORES."ID"), no se hace nada.
--    b) Si la constraint objetivo existe con otra definición, o existe un
--       objeto (pg_class) con ese nombre, se reporta conflicto y DETIENE;
--       nunca se elimina nada automáticamente.
DO $$
DECLARE
  fk_equivalente boolean;
BEGIN
  -- a) ¿Existe FK equivalente (profesor_id → PROFESORES."ID")?
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class ct ON ct.oid = con.conrelid
    JOIN pg_namespace nt ON nt.oid = ct.relnamespace
    JOIN pg_class rt ON rt.oid = con.confrelid
    JOIN pg_namespace nr ON nr.oid = rt.relnamespace
    WHERE con.contype = 'f'
      AND nt.nspname = 'public' AND ct.relname = 'asignaciones_profesor'
      AND nr.nspname = 'public' AND rt.relname = 'PROFESORES'
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute ca ON ca.attrelid = con.conrelid AND ca.attnum = k
        WHERE ca.attname = 'profesor_id'
      )
      AND EXISTS (
        SELECT 1 FROM unnest(con.confkey) k
        JOIN pg_attribute ra ON ra.attrelid = con.confrelid AND ra.attnum = k
        WHERE ra.attname = 'ID'
      )
  ) INTO fk_equivalente;

  IF fk_equivalente THEN
    RAISE NOTICE 'C4.13.4: FK asignaciones_profesor.profesor_id → public."PROFESORES"("ID") ya existe → no se crea.';
    RETURN;
  END IF;

  -- b) ¿Conflicto de nombre con la FK objetivo?
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class ct ON ct.oid = con.conrelid
    JOIN pg_namespace nt ON nt.oid = ct.relnamespace
    WHERE nt.nspname = 'public'
      AND ct.relname = 'asignaciones_profesor'
      AND con.conname = 'asignaciones_profesor_profesor_id_fkey'
  ) THEN
    RAISE EXCEPTION 'C4.13.4: conflicto: la constraint asignaciones_profesor_profesor_id_fkey ya existe con otra definición. Revisar manualmente; NO se elimina nada.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'asignaciones_profesor_profesor_id_fkey'
  ) THEN
    RAISE EXCEPTION 'C4.13.4: conflicto: existe un objeto con el nombre asignaciones_profesor_profesor_id_fkey en pg_class. Revisar manualmente; NO se elimina nada.';
  END IF;

  EXECUTE 'ALTER TABLE public.asignaciones_profesor
           ADD CONSTRAINT asignaciones_profesor_profesor_id_fkey
           FOREIGN KEY (profesor_id)
           REFERENCES public."PROFESORES" ("ID")
           ON DELETE RESTRICT';
  RAISE NOTICE 'C4.13.4: FK asignaciones_profesor.profesor_id → public."PROFESORES"("ID") creada (ON DELETE RESTRICT).';
END $$;

-- 3) Índice de búsqueda por identidad estructural (idempotente por nombre).
CREATE INDEX IF NOT EXISTS asignaciones_profesor_profesor_id_idx
  ON public.asignaciones_profesor (profesor_id);

-- 4) PROTECCIÓN ESTRUCTURAL ANTI-DUPLICADOS.
--    Índice UNIQUE PARCIAL (grupo_materia_id, profesor_id) WHERE profesor_id
--    IS NOT NULL:
--      * un profesor no puede tener dos filas con el mismo grupo_materia;
--      * varios profesores pueden compartir grupo_materia (co-docencia);
--      * filas legacy con profesor_id NULL no interfieren;
--      * la UNIQUE legacy (grupo_materia_id, profesor_clave) se mantiene.
--    Idempotente: si ya existe un índice equivalente con OTRO nombre (mismas
--    columnas + predicate), no se duplica. Si el nombre objetivo está ocupado
--    por un objeto con otra definición, se reporta conflicto y DETIENE; nunca
--    se elimina nada automáticamente.
DO $$
DECLARE
  idx_equivalente boolean;
BEGIN
  -- ¿Existe ya un índice UNIQUE parcial equivalente?
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'asignaciones_profesor'
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND array_length(i.indkey, 1) = 2
      AND (
        SELECT array_agg(a.attname ORDER BY u.ord)::text
        FROM unnest(i.indkey) WITH ORDINALITY u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
      ) = 'grupo_materia_id,profesor_id'
  ) INTO idx_equivalente;

  IF idx_equivalente THEN
    RAISE NOTICE 'C4.13.4: ya existe un índice UNIQUE parcial equivalente (grupo_materia_id, profesor_id) WHERE profesor_id IS NOT NULL → no se crea duplicado.';
    RETURN;
  END IF;

  -- ¿Conflicto de nombre con el índice a crear?
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'asignaciones_profesor_grupo_materia_profesor_uidx'
  ) THEN
    RAISE EXCEPTION 'C4.13.4: conflicto: ya existe un objeto con el nombre asignaciones_profesor_grupo_materia_profesor_uidx con otra definición. Revisar manualmente; NO se elimina nada.';
  END IF;

  EXECUTE 'CREATE UNIQUE INDEX asignaciones_profesor_grupo_materia_profesor_uidx
           ON public.asignaciones_profesor (grupo_materia_id, profesor_id)
           WHERE profesor_id IS NOT NULL';
  RAISE NOTICE 'C4.13.4: índice UNIQUE parcial creado (grupo_materia_id, profesor_id) WHERE profesor_id IS NOT NULL.';
END $$;

-- ============================================================================
-- NOTAS FINALES
--   * `profesor_id` SMALLINT = identidad ESTRUCTURAL del profesor.
--   * public."PROFESORES"."ID" es la PRIMARY KEY existente ("PROFESORES_pkey").
--   * `profesor_clave` = compatibilidad/histórico (NO identidad estructural).
--   * UNIQUE parcial permite co-docencia; las filas legacy con profesor_id
--     NULL quedan permitidas.
--   * UNIQUE legacy (grupo_materia_id, profesor_clave) se mantiene intacta.
--   * RLS intacta (policy `asignaciones_profesor_all`, pública, deliberada).
--   * Aplicable en el SQL editor de Supabase; re-ejecutable sin errores.
--   * `profesor_id` sigue siendo nullable: NOT NULL y cobertura real se
--     evaluarán en la fase de población administrativa.
-- ============================================================================



