-- ============================================================================
-- TRASPASO TOTAL DE UNA MATERIA AL PROFESOR QUE LA SUBE  (Prompt D — R-1)
-- ----------------------------------------------------------------------------
-- RPC transaccional `traspasar_materia_a_profesor(gm uuid, profesor smallint)`.
-- Autoridad ÚNICA del traspaso: subir la plantilla de una materia convierte al
-- profesor que la sube en su dueño. En UNA sola transacción:
--
--   1) Valida que el grupo_materia y el profesor existan.
--   2) Asignación: toda fila ACTIVA de `asignaciones_profesor` para ese
--      grupo_materia cuyo `profesor_id` NO sea el destino → `activo=false,
--      hasta=now()`. Nunca DELETE.
--   3) Asignación destino: se crea o se reactiva `(profesor_id, grupo_materia)`
--      con `activo=true, hasta=null` (`desde=now()` solo si es nueva).
--   4) Registros: filas de `clases_impartidas` y `asistencia_alumnos` de esa
--      materia cuyo `profesor_id` no sea el destino pasan al destino.
--      SOLO cambian columnas de identidad: `profesor_id` (y `profesor_clave`
--      legacy → NULL). NINGUNA otra columna se toca.
--      Colisión de UNIQUE (destino ya tiene fila para la misma materia/grupo/
--      fecha): la fila que ya es del destino es la AUTORITATIVA; la fila del
--      profesor anterior se ARCHIVA (nunca se borra) en
--      `asistencia_traspasos_historico` con `profesor_id_origen` y
--      `profesor_id_destino`.
--   5) Devuelve conteos (asignaciones desactivadas, filas migradas y
--      archivadas de cada tabla).
--
-- Idempotente / re-ejecutable (CREATE OR REPLACE + guards). Aditivo sobre el
-- SQL del Prompt C (que debe ejecutarse PRIMERO: este RPC usa sus columnas).
-- Rollback automático: cualquier RAISE revierte TODO (nunca queda la materia
-- repartida entre dos profesores).
-- ============================================================================

-- ============================================================================
-- 0) TABLA DE HISTORIAL DE TRASPASOS (archivo, NUNCA borra datos)
--    Misma forma de la fila origen + trazabilidad del traspaso. Cobertura de
--    las dos tablas origen (curp/nombre solo existen en asistencia_alumnos).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.asistencia_traspasos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla_origen text NOT NULL
    CHECK (tabla_origen IN ('clases_impartidas', 'asistencia_alumnos')),
  fila_origen_id uuid NOT NULL,
  grupo_materia_id uuid NOT NULL,
  profesor_id_origen integer,
  profesor_clave_origen text,
  profesor_id_destino integer NOT NULL,
  traspasado_en timestamptz NOT NULL DEFAULT now(),
  -- columnas de datos (solo las que aplican a la tabla origen)
  curp text,
  grado text,
  grupo text,
  carrera text,
  nombre text,
  fecha date,
  clases integer,
  clases_asistidas integer,
  periodo_id uuid,
  periodo_evaluacion_id uuid,
  created_at timestamptz,
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS asistencia_traspasos_historico_gm_idx
  ON public.asistencia_traspasos_historico (grupo_materia_id, traspasado_en);

-- ============================================================================
-- 1) RPC TRANSACCIONAL traspasar_materia_a_profesor
-- ============================================================================
CREATE OR REPLACE FUNCTION public.traspasar_materia_a_profesor(
  p_grupo_materia uuid,
  p_profesor_id smallint
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_clave_dest text;
  v_dest_asig uuid;
  v_dest_activo boolean;
  v_estado_destino text;
  v_asig_desactivadas bigint;
  v_clases_migradas bigint;
  v_clases_archivadas bigint;
  v_asistencia_migradas bigint;
  v_asistencia_archivadas bigint;
BEGIN
  -- 1) Validaciones: el grupo_materia y el profesor deben existir.
  IF NOT EXISTS (SELECT 1 FROM public.grupo_materias WHERE id = p_grupo_materia) THEN
    RAISE EXCEPTION 'traspasar_materia_a_profesor: el grupo_materia % no existe', p_grupo_materia;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."PROFESORES" WHERE "ID" = p_profesor_id) THEN
    RAISE EXCEPTION 'traspasar_materia_a_profesor: el profesor % no existe (PROFESORES.ID)', p_profesor_id;
  END IF;

  -- Clave legacy del destino SOLO como dato histórico (nunca como criterio).
  SELECT "CLAVE" INTO v_clave_dest FROM public."PROFESORES" WHERE "ID" = p_profesor_id;

  -- 2) Asignación: se desactiva a cualquier otro profesor ACTIVO de la materia.
  UPDATE public.asignaciones_profesor
  SET activo = false, hasta = now()
  WHERE grupo_materia_id = p_grupo_materia
    AND activo IS TRUE
    AND profesor_id IS DISTINCT FROM p_profesor_id;
  GET DIAGNOSTICS v_asig_desactivadas = ROW_COUNT;

  -- 3) Asignación destino: existe → reactivar; no existe → crear.
  SELECT id, activo INTO v_dest_asig, v_dest_activo
  FROM public.asignaciones_profesor
  WHERE grupo_materia_id = p_grupo_materia
    AND profesor_id = p_profesor_id;

  IF v_dest_asig IS NOT NULL THEN
    IF v_dest_activo IS NOT TRUE THEN
      UPDATE public.asignaciones_profesor
      SET activo = true, hasta = null
      WHERE id = v_dest_asig;
      v_estado_destino := 'reactivada';
    ELSE
      v_estado_destino := 'ya_activa';
    END IF;
  ELSE
    BEGIN
      INSERT INTO public.asignaciones_profesor
        (profesor_id, profesor_clave, grupo_materia_id, activo, desde, hasta)
      VALUES (p_profesor_id, v_clave_dest, p_grupo_materia, true, now(), null)
      RETURNING id INTO v_dest_asig;
      v_estado_destino := 'creada';
    EXCEPTION WHEN unique_violation THEN
      -- La UNIQUE legacy (grupo_materia_id, profesor_clave) puede bloquear el
      -- INSERT cuando varios profesores comparten CLAVE. NO se busca ni se
      -- reconcilia por contraseña (regla D-4): se falla alto y el directivo
      -- corrige las CLAVE duplicadas de PROFESORES.
      RAISE EXCEPTION
        'traspasar_materia_a_profesor: no se pudo crear la asignación destino: la UNIQUE legacy (grupo_materia_id, profesor_clave) ya tiene ese slot. Corrige las CLAVE duplicadas de PROFESORES y reintenta.';
    END;
  END IF;


  -- 4a) clases_impartidas: archivar colisiones y luego migrar el resto.
  --     La fila del destino (o la más reciente de cada clave natural) manda;
  --     la del profesor anterior se ARCHIVA en el historial, nunca se borra.
  WITH archivar AS (
    SELECT o.id
    FROM public.clases_impartidas o
    WHERE o.grupo_materia_id = p_grupo_materia
      AND o.profesor_id IS NOT NULL
      AND o.profesor_id IS DISTINCT FROM p_profesor_id
      AND EXISTS (
        SELECT 1
        FROM public.clases_impartidas r
        WHERE r.grupo_materia_id = p_grupo_materia
          AND r.id <> o.id
          AND r.grado = o.grado
          AND r.grupo = o.grupo
          AND r.fecha = o.fecha
          AND (
            r.profesor_id = p_profesor_id
            OR (
              r.profesor_id IS DISTINCT FROM p_profesor_id
              AND (coalesce(r.updated_at, o.updated_at), r.id) >
                  (coalesce(o.updated_at, o.updated_at), o.id)
            )
          )
      )
  )
  INSERT INTO public.asistencia_traspasos_historico
    (tabla_origen, fila_origen_id, grupo_materia_id, profesor_id_origen,
     profesor_clave_origen, profesor_id_destino, grado, grupo, carrera, fecha,
     clases, periodo_id, periodo_evaluacion_id, created_at, updated_at)
  SELECT 'clases_impartidas', o.id, o.grupo_materia_id, o.profesor_id,
         o.profesor_clave, p_profesor_id, o.grado, o.grupo, o.carrera, o.fecha,
         o.clases, o.periodo_id, o.periodo_evaluacion_id, o.created_at, o.updated_at
  FROM public.clases_impartidas o
  JOIN archivar a ON a.id = o.id;
  GET DIAGNOSTICS v_clases_archivadas = ROW_COUNT;

  WITH archivar AS (
    SELECT o.id
    FROM public.clases_impartidas o
    WHERE o.grupo_materia_id = p_grupo_materia
      AND o.profesor_id IS NOT NULL
      AND o.profesor_id IS DISTINCT FROM p_profesor_id
      AND EXISTS (
        SELECT 1
        FROM public.clases_impartidas r
        WHERE r.grupo_materia_id = p_grupo_materia
          AND r.id <> o.id
          AND r.grado = o.grado
          AND r.grupo = o.grupo
          AND r.fecha = o.fecha
          AND (
            r.profesor_id = p_profesor_id
            OR (
              r.profesor_id IS DISTINCT FROM p_profesor_id
              AND (coalesce(r.updated_at, o.updated_at), r.id) >
                  (coalesce(o.updated_at, o.updated_at), o.id)
            )
          )
      )
  )
  DELETE FROM public.clases_impartidas o USING archivar a WHERE o.id = a.id;

  UPDATE public.clases_impartidas
  SET profesor_id = p_profesor_id, profesor_clave = NULL
  WHERE grupo_materia_id = p_grupo_materia
    AND profesor_id IS NOT NULL
    AND profesor_id IS DISTINCT FROM p_profesor_id;
  GET DIAGNOSTICS v_clases_migradas = ROW_COUNT;


  -- 4b) asistencia_alumnos: idéntico, con curp en la clave natural.
  WITH archivar AS (
    SELECT o.id
    FROM public.asistencia_alumnos o
    WHERE o.grupo_materia_id = p_grupo_materia
      AND o.profesor_id IS NOT NULL
      AND o.profesor_id IS DISTINCT FROM p_profesor_id
      AND EXISTS (
        SELECT 1
        FROM public.asistencia_alumnos r
        WHERE r.grupo_materia_id = p_grupo_materia
          AND r.id <> o.id
          AND r.curp = o.curp
          AND r.grado = o.grado
          AND r.grupo = o.grupo
          AND r.fecha = o.fecha
          AND (
            r.profesor_id = p_profesor_id
            OR (
              r.profesor_id IS DISTINCT FROM p_profesor_id
              AND (coalesce(r.updated_at, o.updated_at), r.id) >
                  (coalesce(o.updated_at, o.updated_at), o.id)
            )
          )
      )
  )
  INSERT INTO public.asistencia_traspasos_historico
    (tabla_origen, fila_origen_id, grupo_materia_id, profesor_id_origen,
     profesor_clave_origen, profesor_id_destino, curp, grado, grupo, carrera,
     nombre, fecha, clases_asistidas, periodo_id, periodo_evaluacion_id,
     created_at, updated_at)
  SELECT 'asistencia_alumnos', o.id, o.grupo_materia_id, o.profesor_id,
         o.profesor_clave, p_profesor_id, o.curp, o.grado, o.grupo, o.carrera,
         o.nombre, o.fecha, o.clases_asistidas, o.periodo_id,
         o.periodo_evaluacion_id, o.created_at, o.updated_at
  FROM public.asistencia_alumnos o
  JOIN archivar a ON a.id = o.id;
  GET DIAGNOSTICS v_asistencia_archivadas = ROW_COUNT;

  WITH archivar AS (
    SELECT o.id
    FROM public.asistencia_alumnos o
    WHERE o.grupo_materia_id = p_grupo_materia
      AND o.profesor_id IS NOT NULL
      AND o.profesor_id IS DISTINCT FROM p_profesor_id
      AND EXISTS (
        SELECT 1
        FROM public.asistencia_alumnos r
        WHERE r.grupo_materia_id = p_grupo_materia
          AND r.id <> o.id
          AND r.curp = o.curp
          AND r.grado = o.grado
          AND r.grupo = o.grupo
          AND r.fecha = o.fecha
          AND (
            r.profesor_id = p_profesor_id
            OR (
              r.profesor_id IS DISTINCT FROM p_profesor_id
              AND (coalesce(r.updated_at, o.updated_at), r.id) >
                  (coalesce(o.updated_at, o.updated_at), o.id)
            )
          )
      )
  )
  DELETE FROM public.asistencia_alumnos o USING archivar a WHERE o.id = a.id;

  UPDATE public.asistencia_alumnos
  SET profesor_id = p_profesor_id, profesor_clave = NULL
  WHERE grupo_materia_id = p_grupo_materia
    AND profesor_id IS NOT NULL
    AND profesor_id IS DISTINCT FROM p_profesor_id;
  GET DIAGNOSTICS v_asistencia_migradas = ROW_COUNT;

  -- 5) Conteos (contrato de la Server Action y de los tests).
  RETURN jsonb_build_object(
    'ok', true,
    'grupo_materia_id', p_grupo_materia,
    'profesor_id', p_profesor_id,
    'asignaciones_desactivadas', v_asig_desactivadas,
    'asignacion_destino', v_estado_destino,
    'clases_migradas', v_clases_migradas,
    'clases_archivadas', v_clases_archivadas,
    'asistencia_migradas', v_asistencia_migradas,
    'asistencia_archivadas', v_asistencia_archivadas
  );
END;
$$;

