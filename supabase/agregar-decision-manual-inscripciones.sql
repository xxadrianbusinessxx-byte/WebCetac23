-- ============================================================================
-- MARCA DE DECISIÓN MANUAL EN INSCRIPCIONES_ALUMNO — PROMPT-4/T1 (opción A)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- PROBLEMA QUE CIERRA:
--   `inscripciones_alumno.activo` significa «pertenece al ciclo operativo».
--   El PROMPT-1/T3 desactivó duplicados usando como verdad el roster de Excel;
--   `sincronizarInscripcionesOperativo()` (ciclo-estado.ts) usa como verdad la
--   fecha (created_at) y, al reactivar el ciclo, elige la fila más reciente por
--   CURP. Son dos autoridades distintas sobre el mismo dato: la decisión del
--   humano (qué fila quedó inactiva) se invertiría en silencio.
--
-- OPCIÓN A (elegida 2026-09-06): marcar la DECISIÓN, no el estado.
--   · `decision_manual = true` significa: un humano decidió explícitamente
--     sobre esta fila (p. ej. «este alumno no va en este grupo»). La
--     sincronización de activación NO toca estas filas.
--   · `activo` recupera su único significado: pertenencia al ciclo operativo.
--   · `motivo` documenta por qué se marcó (traza, no lógica).
--
-- SEMÁNTICA:
--   · DEFAULT false es INTENCIONAL: las inscripciones nuevas NO son decisiones
--     manuales; solo se marcan las que un humano descartó explícitamente.
--   · La marca es ADITIVA y REVERSIBLE (poner decision_manual=false devuelve
--     la fila al criterio automático por fecha).
--
-- Aditivo e idempotente: seguro de re-ejecutar.
-- ============================================================================

ALTER TABLE "inscripciones_alumno"
  ADD COLUMN IF NOT EXISTS decision_manual boolean
  NOT NULL DEFAULT false;

ALTER TABLE "inscripciones_alumno"
  ADD COLUMN IF NOT EXISTS motivo text;
