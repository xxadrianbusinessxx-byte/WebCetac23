-- ============================================================================
-- FASE 3 — RPC CONSOLIDADA PARA /perfil
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (función nueva, ADITIVA)
--
-- OBJETIVO: consolidar en UNA invocación las lecturas de actionObtenerPerfilAlumno
-- (~21 requests HTTP a PostgREST por perfil) → 1 perfil = 1 request HTTP.
--
-- REGLAS: ADITIVA (no toca tablas/columnas/tipos/identidad). La identidad del
-- alumno la resuelve la app (CURP ya normalizado); la RPC no decide roles ni
-- permisos. REGISTRO/boleta (OpenAPI + select(*) + matching JS) y Cloudinary
-- se quedan en la app.
--
-- SEGURIDAD: SECURITY DEFINER + search_path fijo. GRANT EXECUTE SOLO a
-- service_role (no anon/authenticated): no es un endpoint público de perfiles.
-- Único parámetro: CURP.
--
-- CONTRATO (jsonb, claves/tipos = tipos TS):
--   alumno, etiquetas, inscripcion, grupo, periodo, carrera (| null)
--   semestres        academico_semestres[]  (app decide estado con gradoASemestre)
--   grupo_materias   GrupoMateriaRow[] activos del grupo
--   materias         MateriaRow[] activas
--   identidades      MateriaIdentidadCatalogo[]
--   nombres_visibles materias_nombres_visibles[]
--   comentarios      { CURP, COMENTARIO, FECHA }[] FECHA desc
-- ============================================================================

CREATE OR REPLACE FUNCTION public.obtener_perfil_alumno(p_curp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_curp text;
  v_alumno jsonb;
  v_etiquetas jsonb;
  v_inscripcion jsonb;
  v_grupo jsonb;
  v_periodo jsonb;
  v_carrera jsonb;
  v_grupo_id uuid;
  v_materia_ids uuid[];
  v_tablas_legacy text[];
  v_semestres jsonb;
  v_gms jsonb;
  v_materias jsonb;
  v_identidades jsonb;
  v_nombres_visibles jsonb;
  v_comentarios jsonb;
BEGIN
  v_curp := upper(btrim(p_curp));
  IF v_curp = '' THEN
    RETURN jsonb_build_object(
      'alumno', NULL, 'etiquetas', NULL, 'inscripcion', NULL,
      'grupo', NULL, 'periodo', NULL, 'carrera', NULL,
      'semestres', '[]'::jsonb, 'grupo_materias', '[]'::jsonb,
      'materias', '[]'::jsonb, 'identidades', '[]'::jsonb,
      'nombres_visibles', '[]'::jsonb, 'comentarios', '[]'::jsonb
    );
  END IF;

  -- ALUMNO (columnas exactas de AlumnoRow).
  SELECT to_jsonb(r) INTO v_alumno
  FROM (
    SELECT "CURP", "P_APELLIDO", "S_APELLIDO", "NOMBRE", "CLAVE"
    FROM "ALUMNOS"
    WHERE "CURP" = v_curp
    LIMIT 1
  ) r;

  -- ETIQUETAS PERSONALES (columnas exactas de EtiquetasPersonalesRow).
  -- FASE 2: se añaden EDAD/ESTATURA (campos personales definidos, aditivos).
  -- GRADO/GRUPO/CARRERA se conservan solo por compatibilidad de lectura; la
  -- identidad académica la resuelve la app desde inscripcion/grupo/carrera.
  SELECT to_jsonb(r) INTO v_etiquetas
  FROM (
    SELECT "CURP", "GENERO", "GRADO", "GRUPO", "CORREO", "CELULAR",
           "TIPO DE SANGRE", "ALERGIAS", "LENTES", "ENFERMEDAD CRONICA",
           "SALUD MENTAL", "NECESIDAD PSICOLOGICA", "PESO", "TALLA",
           "EDAD", "ESTATURA",
           "VACUNACION", "CARRERA", "EMPTY1", "EMPTY2", "EMPTY3",
           "EMPTY4", "EMPTY5", "EMPTY6", "COMENTARIO PERSONAL"
    FROM "ETIQUETAS PERSONALES"
    WHERE "CURP" = v_curp
    LIMIT 1
  ) r;

  -- INSCRIPCIÓN ACTIVA (misma semántica que obtenerInscripcionActiva).
  SELECT to_jsonb(r) INTO v_inscripcion
  FROM (
    SELECT id, curp, grupo_id, activo, created_at, updated_at
    FROM inscripciones_alumno
    WHERE curp = v_curp AND activo = true
    ORDER BY created_at DESC
    LIMIT 1
  ) r;

  IF v_inscripcion IS NULL THEN
    RETURN jsonb_build_object(
      'alumno', v_alumno, 'etiquetas', v_etiquetas, 'inscripcion', NULL,
      'grupo', NULL, 'periodo', NULL, 'carrera', NULL,
      'semestres', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.semestre), '[]'::jsonb) FROM academico_semestres s),
      'grupo_materias', '[]'::jsonb, 'materias', '[]'::jsonb,
      'identidades', '[]'::jsonb,
      'nombres_visibles', (SELECT COALESCE(jsonb_agg(to_jsonb(nv) ORDER BY nv.materia_id), '[]'::jsonb) FROM materias_nombres_visibles nv),
      'comentarios', (SELECT COALESCE(jsonb_agg(r ORDER BY r."FECHA" DESC NULLS LAST), '[]'::jsonb)
                      FROM (SELECT "CURP", "COMENTARIO", "FECHA" FROM "COMENTARIOS" WHERE "CURP" = v_curp) r)
    );
  END IF;

  v_grupo_id := (v_inscripcion->>'grupo_id')::uuid;

  -- GRUPO / PERIODO / CARRERA (resolución única; evita la doble resolución
  -- actual en resolverGrupoAlumno + resolverMateriasAlumno).
  SELECT to_jsonb(r) INTO v_grupo
  FROM (
    SELECT id, periodo_id, grado, nombre, carrera_id, activo, created_at, updated_at
    FROM grupos WHERE id = v_grupo_id AND activo = true LIMIT 1
  ) r;

  IF v_grupo IS NULL THEN
    RETURN jsonb_build_object(
      'alumno', v_alumno, 'etiquetas', v_etiquetas, 'inscripcion', v_inscripcion,
      'grupo', NULL, 'periodo', NULL, 'carrera', NULL,
      'semestres', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.semestre), '[]'::jsonb) FROM academico_semestres s),
      'grupo_materias', '[]'::jsonb, 'materias', '[]'::jsonb,
      'identidades', '[]'::jsonb,
      'nombres_visibles', (SELECT COALESCE(jsonb_agg(to_jsonb(nv) ORDER BY nv.materia_id), '[]'::jsonb) FROM materias_nombres_visibles nv),
      'comentarios', (SELECT COALESCE(jsonb_agg(r ORDER BY r."FECHA" DESC NULLS LAST), '[]'::jsonb)
                      FROM (SELECT "CURP", "COMENTARIO", "FECHA" FROM "COMENTARIOS" WHERE "CURP" = v_curp) r)
    );
  END IF;

  SELECT to_jsonb(r) INTO v_periodo
  FROM (
    SELECT id, nombre, activo, created_at, updated_at
    FROM periodos WHERE id = (v_grupo->>'periodo_id')::uuid AND activo = true LIMIT 1
  ) r;

  -- Semántica actual (resolverGrupoAlumno): si el PERIODO no existe/activo, el
  -- grupo NO se resuelve (equivalente a "sin grupo"). Mismo retorno que el
  -- branch de grupo nulo.
  IF v_periodo IS NULL THEN
    RETURN jsonb_build_object(
      'alumno', v_alumno, 'etiquetas', v_etiquetas, 'inscripcion', v_inscripcion,
      'grupo', NULL, 'periodo', NULL, 'carrera', NULL,
      'semestres', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.semestre), '[]'::jsonb) FROM academico_semestres s),
      'grupo_materias', '[]'::jsonb, 'materias', '[]'::jsonb,
      'identidades', '[]'::jsonb,
      'nombres_visibles', (SELECT COALESCE(jsonb_agg(to_jsonb(nv) ORDER BY nv.materia_id), '[]'::jsonb) FROM materias_nombres_visibles nv),
      'comentarios', (SELECT COALESCE(jsonb_agg(r ORDER BY r."FECHA" DESC NULLS LAST), '[]'::jsonb)
                      FROM (SELECT "CURP", "COMENTARIO", "FECHA" FROM "COMENTARIOS" WHERE "CURP" = v_curp) r)
    );
  END IF;

  IF (v_grupo->>'carrera_id') IS NOT NULL THEN
    SELECT to_jsonb(r) INTO v_carrera
    FROM (
      SELECT id, clave, nombre, activo, created_at, updated_at
      FROM carreras WHERE id = (v_grupo->>'carrera_id')::uuid LIMIT 1
    ) r;
  END IF;

  -- SEMESTRES (todas las filas; la app decide el estado con gradoASemestre).
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.semestre), '[]'::jsonb) INTO v_semestres
  FROM academico_semestres s;

  -- GRUPO_MATERIAS activos del grupo + ids de materias.
  SELECT COALESCE(jsonb_agg(to_jsonb(gm) ORDER BY gm.id), '[]'::jsonb),
         COALESCE(ARRAY_AGG(gm.materia_id), ARRAY[]::uuid[])
  INTO v_gms, v_materia_ids
  FROM grupo_materias gm
  WHERE gm.grupo_id = v_grupo_id AND gm.activo = true;

  -- MATERIAS activas referenciadas.
  IF array_length(v_materia_ids, 1) > 0 THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.id), '[]'::jsonb) INTO v_materias
    FROM materias m
    WHERE m.id = ANY(v_materia_ids) AND m.activo = true;
  ELSE
    v_materias := '[]'::jsonb;
  END IF;

  -- IDENTIDADES DE CATÁLOGO (misma forma que resolverIdentidadesCatalogo:
  -- incluye gm_activo, sin filtrar por activo; omite filas sin grupo o materia).
  SELECT COALESCE(ARRAY_AGG(DISTINCT gm.tabla_legacy), ARRAY[]::text[]) INTO v_tablas_legacy
  FROM grupo_materias gm
  WHERE gm.grupo_id = v_grupo_id
    AND gm.activo = true
    AND gm.tabla_legacy IS NOT NULL
    AND btrim(gm.tabla_legacy) <> '';

  IF array_length(v_tablas_legacy, 1) > 0 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tablaLegacy', gm.tabla_legacy,
      'grupoMateriaId', gm.id,
      'gmActivo', gm.activo,
      'grado', COALESCE(g.grado, ''),
      'grupo', COALESCE(g.nombre, ''),
      'carreraClave', c.clave,
      'asignatura', COALESCE(m.nombre, '')
    )), '[]'::jsonb) INTO v_identidades
    FROM grupo_materias gm
    LEFT JOIN grupos g ON g.id = gm.grupo_id
    LEFT JOIN materias m ON m.id = gm.materia_id
    LEFT JOIN carreras c ON c.id = g.carrera_id
    WHERE gm.tabla_legacy = ANY(v_tablas_legacy)
      AND g.id IS NOT NULL
      AND m.id IS NOT NULL;
  ELSE
    v_identidades := '[]'::jsonb;
  END IF;

  -- NOMBRES VISIBLES (todas; la app filtra activos como hoy).
  SELECT COALESCE(jsonb_agg(to_jsonb(nv) ORDER BY nv.materia_id), '[]'::jsonb) INTO v_nombres_visibles
  FROM materias_nombres_visibles nv;

  -- COMENTARIOS (misma orden que listarComentariosAlumno).
  SELECT COALESCE(jsonb_agg(r ORDER BY r."FECHA" DESC NULLS LAST), '[]'::jsonb) INTO v_comentarios
  FROM (SELECT "CURP", "COMENTARIO", "FECHA" FROM "COMENTARIOS" WHERE "CURP" = v_curp) r;

  RETURN jsonb_build_object(
    'alumno', v_alumno,
    'etiquetas', v_etiquetas,
    'inscripcion', v_inscripcion,
    'grupo', v_grupo,
    'periodo', v_periodo,
    'carrera', v_carrera,
    'semestres', v_semestres,
    'grupo_materias', v_gms,
    'materias', v_materias,
    'identidades', v_identidades,
    'nombres_visibles', v_nombres_visibles,
    'comentarios', v_comentarios
  );
END;
$$;

-- SOLO service_role: NO exponer como endpoint público de perfiles.
-- (Postgres otorga EXECUTE a PUBLIC por defecto al crear la función; es
-- obligatorio revocarlo de PUBLIC/anon/authenticated para que la RPC NO sea
-- invocable por la API pública de PostgREST.)
REVOKE EXECUTE ON FUNCTION public.obtener_perfil_alumno(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_perfil_alumno(text) TO service_role;

-- NOTA (PostgREST): con GRANT solo a service_role, la RPC solo es invocable con
-- la clave de servicio (clienteLecturaEscolar en la app). Los roles anon/
-- authenticated NO podrán ejecutarla, preservando la autorización de la app.



