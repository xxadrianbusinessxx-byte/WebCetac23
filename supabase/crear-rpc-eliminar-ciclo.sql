-- ============================================================================
-- ELIMINAR CICLO — RPC transaccional eliminar_ciclo(p_periodo uuid)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (CREATE OR REPLACE, idempotente).
--
-- Borra un ciclo COMPLETO y todo lo relacionado en UNA sola transacción.
-- Ante cualquier error (RAISE) PostgreSQL revierte TODO: el periodo nunca queda
-- parcialmente borrado.
--
-- REGLAS DE SEGURIDAD (validan dentro de la misma transacción, NO solo en TS):
--   1) Un periodo con CUALQUIER inscripción (activa o histórica) NO se puede
--      eliminar. El error reporta el número exacto de inscripciones.
--   2) Un periodo OPERATIVO (estado='operativo' o activo=true) NUNCA se elimina:
--      debe desactivarse / pasar a HISTORICO primero, en otro flujo.
--   3) La confirmación por nombre se valida en la Server Action (otra capa);
--      el RPC no la recibe para no confiar en texto.
--   4) Registra el intento en ciclo_transiciones ANTES de borrar y desvincula
--      la fila (periodo_id=NULL) para que el rastro quede aunque el periodo ya
--      no exista.
--
-- ORDEN DE DEPENDENCIAS (lista real verificada en la BD, 2026-09-03):
--   Directas por periodo_id : academico_semestres · horario_semanal ·
--     periodos_evaluacion · calendario_escolar · clases_impartidas ·
--     asistencia_alumnos · justificaciones_asistencia (+ mensajes_justificacion
--     en cascada ON DELETE CASCADE)
--   Vía grupos            : asignaciones_profesor (por grupo_materia_id) ·
--     grupo_materias · inscripciones_alumno · grupos
--   Auditoría             : ciclo_transiciones (se desvincula, NO se borra)
--   Deuda R5 documentada  : calendario_escolar.ciclo_escolar (texto legacy)
--     sigue existiendo; las filas legacy SIN periodo_id no son atribuibles de
--     forma segura a un periodo y NO se tocan aquí.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eliminar_ciclo(p_periodo uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_nombre text;
  v_activo boolean;
  v_estado text;
  v_tiene_estado boolean;
  v_estado_efectivo text;
  v_grupos bigint;
  v_grupos_ids uuid[];
  v_gm bigint;
  v_gm_ids uuid[];
  v_insc bigint;
  v_horario bigint;
  v_parciales bigint;
  v_calendario bigint;
  v_transicion_id uuid;
BEGIN
  SELECT nombre, activo INTO v_nombre, v_activo
  FROM public.periodos WHERE id = p_periodo;
  IF v_nombre IS NULL THEN
    RAISE EXCEPTION 'eliminar_ciclo: el ciclo % no existe', p_periodo;
  END IF;

  -- Estado efectivo (compatible con/sin columna periodos.estado).
  SELECT count(*) > 0 INTO v_tiene_estado
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'periodos' AND column_name = 'estado';
  IF v_tiene_estado THEN
    SELECT estado INTO v_estado FROM public.periodos WHERE id = p_periodo;
  END IF;
  v_estado_efectivo := CASE
    WHEN v_tiene_estado AND v_estado IN ('borrador', 'operativo', 'historico') THEN v_estado
    WHEN v_activo THEN 'operativo'
    ELSE 'historico'
  END;

  -- REGLA 1: nunca se elimina el ciclo OPERATIVO.
  IF v_estado_efectivo = 'operativo' OR v_activo THEN
    RAISE EXCEPTION
      'No se puede eliminar el ciclo «%» porque es el OPERATIVO actual (estado=operativo / activo=true). Desactívalo o pásalo a HISTORICO primero (en otro flujo).',
      v_nombre;
  END IF;

  -- REGLA 2: CUALQUIER inscripción (activa o histórica) bloquea.
  SELECT count(*) INTO v_insc
  FROM public.inscripciones_alumno i
  JOIN public.grupos g ON g.id = i.grupo_id
  WHERE g.periodo_id = p_periodo;
  IF v_insc > 0 THEN
    RAISE EXCEPTION
      'No se puede eliminar el ciclo «%»: tiene % inscripciones (activas o históricas).',
      v_nombre, v_insc;
  END IF;

  -- Conteos para el detalle de auditoría (misma transacción, una sola pasada).
  SELECT count(*), coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_grupos, v_grupos_ids
  FROM public.grupos WHERE periodo_id = p_periodo;
  SELECT count(*), coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_gm, v_gm_ids
  FROM public.grupo_materias WHERE grupo_id = ANY(v_grupos_ids);
  SELECT count(*) INTO v_horario FROM public.horario_semanal WHERE periodo_id = p_periodo;
  SELECT count(*) INTO v_parciales FROM public.periodos_evaluacion WHERE periodo_id = p_periodo;
  SELECT count(*) INTO v_calendario FROM public.calendario_escolar WHERE periodo_id = p_periodo;

  -- Auditoría ANTES del borrado: queda rastro aunque el periodo ya no exista.
  INSERT INTO public.ciclo_transiciones
    (periodo_id, operacion, estado_anterior, estado_nuevo, actor, resultado, detalle)
  VALUES (p_periodo, 'eliminar_ciclo', v_estado_efectivo, NULL, current_user::text, 'ok',
    format('eliminación del ciclo «%s» (id=%s): grupos=%s, grupo_materias=%s, inscripciones=%s, horario=%s, parciales=%s, calendario=%s',
      v_nombre, p_periodo, v_grupos, v_gm, v_insc, v_horario, v_parciales, v_calendario))
  RETURNING id INTO v_transicion_id;

  -- 1) Dependientes directos del periodo.
  DELETE FROM public.academico_semestres WHERE periodo_id = p_periodo;
  DELETE FROM public.horario_semanal WHERE periodo_id = p_periodo;
  DELETE FROM public.periodos_evaluacion WHERE periodo_id = p_periodo;
  DELETE FROM public.clases_impartidas WHERE periodo_id = p_periodo;
  DELETE FROM public.asistencia_alumnos WHERE periodo_id = p_periodo;
  -- mensajes_justificacion se elimina en cascada (ON DELETE CASCADE).
  DELETE FROM public.justificaciones_asistencia WHERE periodo_id = p_periodo;
  -- Calendario por periodo_id (deuda R5: filas legacy texto sin periodo_id no
  -- son atribuibles de forma segura; quedan fuera, documentado).
  DELETE FROM public.calendario_escolar WHERE periodo_id = p_periodo;

  -- 2) Dependientes vía grupos.
  DELETE FROM public.asignaciones_profesor WHERE grupo_materia_id = ANY(v_gm_ids);
  DELETE FROM public.grupo_materias WHERE grupo_id = ANY(v_grupos_ids);
  -- 0 filas por la validación de inscripciones; se ejecuta igual por defensa.
  DELETE FROM public.inscripciones_alumno WHERE grupo_id = ANY(v_grupos_ids);
  DELETE FROM public.grupos WHERE periodo_id = p_periodo;

  -- 3) Auditoría (la recién creada y las históricas) se desvincula del periodo
  --    para poder borrarlo; el rastro se conserva con periodo_id NULL.
  UPDATE public.ciclo_transiciones SET periodo_id = NULL WHERE periodo_id = p_periodo;

  -- 4) El periodo.
  DELETE FROM public.periodos WHERE id = p_periodo;

  RETURN jsonb_build_object(
    'ok', true,
    'periodo_id', p_periodo,
    'nombre', v_nombre,
    'grupos', v_grupos,
    'grupo_materias', v_gm,
    'inscripciones', v_insc,
    'horario', v_horario,
    'parciales', v_parciales,
    'calendario', v_calendario,
    'transicion_id', v_transicion_id
  );
END;
$$;
