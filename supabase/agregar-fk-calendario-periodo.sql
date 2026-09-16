-- agregar-fk-calendario-periodo.sql
-- Cierra el último resto de R5: `calendario_escolar.periodo_id` existe y está
-- poblada (77/77 filas al 2026-09-16), pero NO tiene clave foránea. Sin ella,
-- nada impide insertar una fila con un `periodo_id` inexistente.
--
-- ADITIVO E IDEMPOTENTE. No borra filas, no toca la columna texto legacy
-- `ciclo_escolar` (@deprecated, conservada por R8), no crea índices nuevos
-- salvo el que la propia FK necesita para ser eficiente.
--
-- GUARDA DE HUÉRFANOS: si existe alguna fila con `periodo_id` que no apunte a
-- un `periodos.id` real, la FK NO se crea y se reporta el conteo. Nunca se
-- borran ni se modifican filas para "hacer sitio" a la constraint.
--
-- Ejecutar en el SQL Editor de Supabase. Re-ejecutable sin efectos.

DO $$
DECLARE
  v_huerfanos bigint;
  v_nulos bigint;
BEGIN
  -- 0) ¿Existe la columna? (si no, este script no aplica todavía)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'calendario_escolar'
      AND column_name = 'periodo_id'
  ) THEN
    RAISE NOTICE 'calendario_escolar.periodo_id no existe: ejecuta antes agregar-periodo-id-calendario.sql. No se hace nada.';
    RETURN;
  END IF;

  -- 1) ¿Ya está la FK? (por definición, no por nombre: puede llamarse distinto)
  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class fc ON fc.oid = con.confrelid
    WHERE n.nspname = 'public'
      AND c.relname = 'calendario_escolar'
      AND fc.relname = 'periodos'
      AND con.contype = 'f'
      AND (
        SELECT array_agg(a.attname ORDER BY u.ord)
        FROM unnest(con.conkey) WITH ORDINALITY u(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
      ) = ARRAY['periodo_id']::name[]
  ) THEN
    RAISE NOTICE 'La FK calendario_escolar.periodo_id -> periodos.id ya existe. Nada que hacer.';
    RETURN;
  END IF;

  -- 2) Guarda de huérfanos ANTES de intentar crearla.
  SELECT count(*) INTO v_huerfanos
  FROM public.calendario_escolar ce
  WHERE ce.periodo_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = ce.periodo_id);

  SELECT count(*) INTO v_nulos
  FROM public.calendario_escolar WHERE periodo_id IS NULL;

  IF v_huerfanos > 0 THEN
    RAISE NOTICE 'NO se crea la FK: % fila(s) de calendario_escolar tienen periodo_id inexistente. Revisalas y vuelve a ejecutar. No se borro nada.', v_huerfanos;
    RETURN;
  END IF;

  IF v_nulos > 0 THEN
    RAISE NOTICE 'Aviso: % fila(s) con periodo_id NULL. La FK las permite (NULL no se valida); se crea igualmente.', v_nulos;
  END IF;

  -- 3) Índice de apoyo (la FK no lo crea sola; sin el, los DELETE en periodos
  --    hacen seq scan sobre calendario_escolar).
  CREATE INDEX IF NOT EXISTS ix_calendario_escolar_periodo_id
    ON public.calendario_escolar (periodo_id);

  -- 4) La FK. ON DELETE RESTRICT: borrar un periodo con calendario debe fallar
  --    ruidosamente, no llevarse los dias por delante. La RPC `eliminar_ciclo`
  --    ya borra el calendario explicitamente antes que el periodo.
  ALTER TABLE public.calendario_escolar
    ADD CONSTRAINT calendario_escolar_periodo_id_fkey
    FOREIGN KEY (periodo_id) REFERENCES public.periodos (id)
    ON DELETE RESTRICT;

  RAISE NOTICE 'FK calendario_escolar.periodo_id -> periodos.id creada (% huerfanos, % nulos).', v_huerfanos, v_nulos;
END $$;

-- Verificacion posterior (opcional):
--   SELECT conname, confrelid::regclass
--   FROM pg_constraint
--   WHERE conrelid = 'public.calendario_escolar'::regclass AND contype = 'f';
