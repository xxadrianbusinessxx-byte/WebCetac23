-- ============================================================================
-- PIEZA 0 — PERIODO "VIGENTE" (exclusivo) para resolver el ciclo operativo
--
-- Concepto:
--   · `activo`  = "existe / disponible para editar o seleccionar en admin".
--                Pueden ser varios `activo=true` a la vez libremente.
--   · `vigente` = el ÚNICO periodo que ven alumnos/profesores/tutores
--                (rollover de ciclo). Exclusivo a nivel BASE DE DATOS.
--
-- ADITIVO · IDEMPOTENTE · SIN DELETE/DROP de datos.
-- Ejecutar en Supabase SQL Editor (no hay ejecutor DDL desde la app/REST).
-- ============================================================================

ALTER TABLE public.periodos ADD COLUMN IF NOT EXISTS vigente boolean NOT NULL DEFAULT false;

-- Garantía de exclusividad en BD: nunca dos periodos `vigente=true`.
CREATE UNIQUE INDEX IF NOT EXISTS periodos_vigente_unico
  ON public.periodos (vigente) WHERE vigente = true;

-- ============================================================================
-- MIGRACIÓN DE DATOS PROPUESTA (EJECUTAR SOLO CON CONFIRMACIÓN):
--   UPDATE public.periodos SET vigente = true WHERE nombre = '2026-2027';
--   -- AGO2026-ENE2027: conservar inactivo (tiene contexto: grupos/materias/
--   --   horario/parciales; FK ON DELETE RESTRICT impediría borrarlo y puede
--   --   servir de plantilla). AGO2026-DIC2026: vacío → DELETE permitido si se
--   --   confirma.
-- ============================================================================

-- Verificación sugerida:
--   SELECT nombre, activo, vigente FROM public.periodos ORDER BY created_at;
-- ============================================================================
-- ROLLBACK (documentado):
--   DROP INDEX IF EXISTS public.periodos_vigente_unico;
--   ALTER TABLE public.periodos DROP COLUMN IF EXISTS vigente;
-- ============================================================================
