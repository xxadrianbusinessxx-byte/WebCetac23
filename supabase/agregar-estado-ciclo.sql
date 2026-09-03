-- ============================================================================
-- F1 — ESTADO DEL CICLO (BORRADOR / OPERATIVO / HISTORICO)
-- Proyecto: mi-web-escolar (AulaNube / CETAC) · Fecha: 2026-09-03
--
-- Qué hace:
--   1) Verifica que NO exista más de un periodo activo (si lo hay, ABORTA:
--      la inconsistencia debe resolverse a mano, no de forma arbitraria).
--   2) Añade la columna `periodos.estado` (text) de forma ADITIVA.
--   3) Backfill seguro con datos reales:
--        activo=true  → 'operativo'
--        activo=false → 'historico'
--      y decisión documentada de transición: 'AGO2026-ENE2027' es un ciclo EN
--      PREPARACIÓN (contexto parcial sin inscripciones) → 'borrador'.
--   4) CHECK de valores + CHECK de coherencia estructural:
--        estado='operativo'  ⇔  activo=true
--      (borrador/historico ⇔ activo=false). El default de `activo` pasa a
--      false para que una inserción accidental no cree un operativo vacío.
--
-- Seguridad: IDEMPOTENTE, ADITIVO, SIN DELETE, SIN DROP de tablas/datos,
-- reversible (ver bloque de ROLLBACK al final).
-- Ejecutar en el SQL Editor de Supabase (no hay ejecutor automático).
-- ============================================================================

-- 1) Precondición: nunca aplicar con dos ciclos activos (reportar, no resolver).
DO $$
DECLARE
  v_activos integer;
BEGIN
  SELECT count(*) INTO v_activos FROM public.periodos WHERE activo IS TRUE;
  IF v_activos > 1 THEN
    RAISE EXCEPTION 'F1: hay % periodos activos. Resuelve la inconsistencia antes de aplicar esta migración.', v_activos;
  END IF;
END $$;

-- 2) Columna aditiva.
ALTER TABLE public.periodos ADD COLUMN IF NOT EXISTS estado text;

-- 3) Backfill (solo sobre filas sin estado).
UPDATE public.periodos SET estado = 'operativo'
 WHERE activo IS TRUE AND estado IS NULL;
UPDATE public.periodos SET estado = 'historico'
 WHERE activo IS NOT TRUE AND estado IS NULL;

-- 3b) Decisión de transición documentada (datos reales): AGO2026-ENE2027 quedó
-- en preparación (0 inscripciones) → BORRADOR. Ajustar si el directivo decide
-- otro destino.
UPDATE public.periodos SET estado = 'borrador'
 WHERE nombre = 'AGO2026-ENE2027' AND estado IS DISTINCT FROM 'borrador';

-- 4) Constraints (idempotente: primero se eliminan versiones previas).
ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_estado_check;
ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_estado_activo_coherencia;

ALTER TABLE public.periodos
  ADD CONSTRAINT periodos_estado_check
  CHECK (estado IN ('borrador','operativo','historico'));

ALTER TABLE public.periodos
  ADD CONSTRAINT periodos_estado_activo_coherencia
  CHECK ( (estado = 'operativo') = (activo IS TRUE) );

ALTER TABLE public.periodos ALTER COLUMN estado SET NOT NULL;
ALTER TABLE public.periodos ALTER COLUMN estado SET DEFAULT 'borrador';
ALTER TABLE public.periodos ALTER COLUMN activo SET DEFAULT false;

CREATE INDEX IF NOT EXISTS periodos_estado_idx ON public.periodos (estado);

-- Verificación sugerida:
--   SELECT nombre, activo, estado FROM public.periodos ORDER BY created_at;

-- ============================================================================
-- ROLLBACK (si se requiere; documentado, no se ejecuta automáticamente):
--   ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_estado_activo_coherencia;
--   ALTER TABLE public.periodos DROP CONSTRAINT IF EXISTS periodos_estado_check;
--   DROP INDEX IF EXISTS public.periodos_estado_idx;
--   ALTER TABLE public.periodos DROP COLUMN IF EXISTS estado;
--   ALTER TABLE public.periodos ALTER COLUMN activo SET DEFAULT true;
-- ============================================================================
