-- VERIFICACIÓN DE INTEGRIDAD DEL CICLO — SOLO LECTURA (no modifica datos)
-- Rama: feature/ciclo-f1-f7-sin-push · Proyecto: WebCetac23
-- Resultados: ERROR=crítico · PASS=ok · WARNING=revisar · LEGACY=pendiente cuantificado
-- Este archivo SOLO hace SELECT; no usarlo como migración.

-- 1) Un solo OPERATIVO.
SELECT 'UNIQUE OPERATIVO' AS check,
       count(*) FILTER (WHERE lower(estado) = 'operativo') AS resultado,
       '<= 1' AS esperado,
       CASE WHEN count(*) FILTER (WHERE lower(estado) = 'operativo') <= 1
            THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.periodos;

-- 2) Coherencia legacy: estado=operativo ↔ activo=true.
SELECT 'LEGACY COHERENCIA OPERATIVO-ACTIVO' AS check,
       count(*) FILTER (WHERE (lower(estado)='operativo') IS DISTINCT FROM (activo IS TRUE)) AS resultado,
       '0 (inconsistencias)' AS esperado,
       CASE WHEN count(*) FILTER (WHERE (lower(estado)='operativo') IS DISTINCT FROM (activo IS TRUE)) = 0
            THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.periodos;

-- 3) Grupos sin periodo o con periodo inexistente.
SELECT 'GRUPOS SIN PERIODO' AS check,
       count(*) AS resultado, '0' AS esperado,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.grupos g
WHERE g.periodo_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = g.periodo_id);

-- 4) grupo_materias a grupo inexistente.
SELECT 'GRUPO_MATERIAS HUERFANAS' AS check,
       count(*) AS resultado, '0' AS esperado,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.grupo_materias gm
WHERE NOT EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = gm.grupo_id);

-- 5) Inscripciones a grupo inexistente.
SELECT 'INSCRIPCIONES A GRUPO INEXISTENTE' AS check,
       count(*) AS resultado, '0' AS esperado,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.inscripciones_alumno i
WHERE NOT EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = i.grupo_id);

-- 6) Calendario legacy (NULL) y con periodo válido.
SELECT 'CALENDARIO SIN PERIODO (LEGACY)' AS check,
       count(*) AS resultado, 'cuantificar (legacy)' AS esperado, 'LEGACY' AS estado
FROM public.calendario_escolar c WHERE c.periodo_id IS NULL;

SELECT 'CALENDARIO CON PERIODO VALIDO' AS check,
       count(*) AS resultado, '>= 0' AS esperado, 'PASS' AS estado
FROM public.calendario_escolar c
WHERE c.periodo_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = c.periodo_id);

-- 7) Evaluaciones huérfanas.
SELECT 'EVALUACIONES SIN PERIODO' AS check,
       count(*) AS resultado, '0' AS esperado,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.periodos_evaluacion e
WHERE e.periodo_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = e.periodo_id);

-- 8) Horarios sin periodo o sin grupo válido.
SELECT 'HORARIOS SIN PERIODO O GRUPO VALIDO' AS check,
       count(*) AS resultado, '0' AS esperado,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'ERROR' END AS estado
FROM public.horario_semanal h
WHERE h.periodo_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = h.periodo_id)
   OR NOT EXISTS (SELECT 1 FROM public.grupos g WHERE g.id = h.grupo_id);

-- 9) Asistencia legacy sin backfill (columnas presentes).
SELECT 'CLASES IMPARTIDAS SIN PERIODO (LEGACY)' AS check,
       count(*) FILTER (WHERE periodo_id IS NULL) AS resultado,
       '0 (tras backfill)' AS esperado, 'LEGACY' AS estado
FROM public.clases_impartidas;

SELECT 'ASISTENCIA ALUMNOS SIN PERIODO (LEGACY)' AS check,
       count(*) FILTER (WHERE periodo_id IS NULL) AS resultado,
       '0 (tras backfill)' AS esperado, 'LEGACY' AS estado
FROM public.asistencia_alumnos;

SELECT 'JUSTIFICACIONES SIN PERIODO (LEGACY)' AS check,
       count(*) FILTER (WHERE periodo_id IS NULL) AS resultado,
       '0 (tras backfill)' AS esperado, 'LEGACY' AS estado
FROM public.justificaciones_asistencia;

-- 10) Huérfanos globales: periodo_id → periodo inexistente.
SELECT 'HUERFANOS GLOBALES PERIODO_ID' AS check,
       (SELECT count(*) FROM public.calendario_escolar WHERE periodo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = periodo_id))
     + (SELECT count(*) FROM public.horario_semanal WHERE periodo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = periodo_id))
     + (SELECT count(*) FROM public.clases_impartidas WHERE periodo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = periodo_id))
     + (SELECT count(*) FROM public.asistencia_alumnos WHERE periodo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = periodo_id))
     + (SELECT count(*) FROM public.justificaciones_asistencia WHERE periodo_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.periodos p WHERE p.id = periodo_id)) AS resultado,
       '0' AS esperado, 'PASS/ERROR' AS estado;
