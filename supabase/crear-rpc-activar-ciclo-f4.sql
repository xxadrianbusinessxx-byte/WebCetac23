-- ============================================================================
-- F4 — RPC TRANSACCIONAL: activar_ciclo_operativo(p_periodo uuid)
-- Activación ATOMICA (BEGIN/COMMIT implícitos en la función) con validaciones
-- mínimas SQL y exclusividad. Reemplaza en producción la secuencia REST del
-- código (que queda como fallback idempotente).
--
-- Compatibilidad: funciona con o sin la columna `periodos.estado`.
-- ADITIVO/REEMPLAZABLE (CREATE OR REPLACE). Ejecutar en Supabase SQL Editor.
-- Rollback automático ante cualquier RAISE.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.activar_ciclo_operativo(p_periodo uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_nombre text;
  v_activo boolean;
  v_estado text;
  v_tiene_estado boolean;
  v_grupos integer;
  v_materias integer;
  v_inscritos integer;
  v_otros integer;
BEGIN
  SELECT nombre, activo INTO v_nombre, v_activo FROM public.periodos WHERE id = p_periodo;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'ciclo inexistente';
  END IF;

  SELECT count(*) > 0 INTO v_tiene_estado
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='periodos' AND column_name='estado';

  IF v_tiene_estado THEN
    SELECT estado INTO v_estado FROM public.periodos WHERE id = p_periodo;
    IF v_estado = 'historico' THEN
      RAISE EXCEPTION 'no se puede reactivar un ciclo historico (%)', v_nombre;
    END IF;
  END IF;

  SELECT count(*) INTO v_grupos FROM public.grupos WHERE periodo_id = p_periodo AND activo IS TRUE;
  SELECT count(*) INTO v_materias
  FROM public.grupo_materias gm
  JOIN public.grupos g ON g.id = gm.grupo_id
  WHERE g.periodo_id = p_periodo AND gm.activo IS TRUE AND g.activo IS TRUE;
  SELECT count(DISTINCT i.curp) INTO v_inscritos
  FROM public.inscripciones_alumno i
  JOIN public.grupos g ON g.id = i.grupo_id
  WHERE g.periodo_id = p_periodo;

  IF v_grupos = 0 THEN RAISE EXCEPTION 'sin grupos (%)', v_nombre; END IF;
  IF v_materias = 0 THEN RAISE EXCEPTION 'sin materias activas (%)', v_nombre; END IF;
  IF v_inscritos = 0 THEN RAISE EXCEPTION 'sin alumnos inscritos (%)', v_nombre; END IF;

  -- Exclusividad: todo lo demás pasa a no operativo.
  SELECT count(*) INTO v_otros FROM public.periodos WHERE activo IS TRUE AND id <> p_periodo;

  IF v_tiene_estado THEN
    UPDATE public.periodos SET activo = FALSE, estado = 'historico' WHERE activo IS TRUE AND id <> p_periodo;
    UPDATE public.periodos SET activo = TRUE, estado = 'operativo' WHERE id = p_periodo;
  ELSE
    UPDATE public.periodos SET activo = FALSE WHERE activo IS TRUE AND id <> p_periodo;
    UPDATE public.periodos SET activo = TRUE WHERE id = p_periodo;
  END IF;

  -- Inscripciones: desactivar filas de otros ciclos.
  UPDATE public.inscripciones_alumno SET activo = FALSE
  WHERE activo IS TRUE
    AND grupo_id IN (
      SELECT g.id FROM public.grupos g JOIN public.periodos p ON p.id = g.periodo_id
      WHERE p.activo IS NOT TRUE
    );

  -- Activar SOLO la fila más reciente por CURP dentro del nuevo operativo.
  UPDATE public.inscripciones_alumno SET activo = TRUE
  WHERE id IN (
    SELECT DISTINCT ON (i.curp) i.id
    FROM public.inscripciones_alumno i
    JOIN public.grupos g ON g.id = i.grupo_id
    WHERE g.periodo_id = p_periodo
    ORDER BY i.curp, i.created_at DESC, i.id DESC
  );

  RETURN format('ciclo %s activado como operativo (exclusivo). Otros desactivados: %s', v_nombre, v_otros);
END;
$$;
