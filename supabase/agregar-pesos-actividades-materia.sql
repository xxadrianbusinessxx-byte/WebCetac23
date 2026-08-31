-- ============================================================================
-- PESOS DE ACTIVIDADES PARA PROMEDIO PONDERADO — BLOQUE 9 (PIEZA 1)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (después de crear-tabla-mapeo-columnas-materias.sql)
--
-- OBJETIVO:
--   Agrega la columna `pesos_actividades` (jsonb) a la tabla de configuración
--   `materias_mapeo_columnas` para permitir un PROMEDIO PONDERADO OPCIONAL por
--   actividad en la vista del alumno.
--
-- SEMÁNTICA (importante):
--   · NULL (default) = FEATURE APAGADA: comportamiento actual sin cambios.
--     El alumno ve exactamente lo que ve hoy (sin promedio calculado).
--   · Objeto { "<columna física de actividad>": porcentaje 0-100 } = el
--     profesor configuró pesos; el promedio ponderado se calcula SOLO en
--     PRESENTACIÓN (en memoria, al renderizar), NUNCA se escribe en las
--     tablas físicas de materia.
--   · La suma puede ser MENOR a 100 (actividades sin peso aún). No debe
--     superar 100; eso se valida en la capa de aplicación.
--
-- Es un cambio ADITIVO e idempotente (IF NOT EXISTS): seguro de re-ejecutar.
-- ============================================================================

ALTER TABLE materias_mapeo_columnas
  ADD COLUMN IF NOT EXISTS pesos_actividades jsonb;
