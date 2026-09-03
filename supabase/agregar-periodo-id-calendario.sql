-- ============================================================================
-- F5 — CALENDARIO ESCOLAR ASOCIADO AL PERIODO (calendario_escolar.periodo_id)
--
-- Aditivo e idempotente. NO borra datos. Compatible con la columna legacy
-- `ciclo_escolar` (texto) que se conserva.
--
-- Estrategia de backfill:
--   1) Añade `periodo_id` (FK) nullable.
--   2) Relaciona por NOMBRE EXACTO (mayúsculas, sin espacios) con `periodos`.
--      Nunca adivina relaciones dudosas (quedan con periodo_id NULL y se
--      reportan en el diagnóstico F5).
--   3) Índice y UNIQUE parcial (periodo_id, fecha) para filas relacionadas.
--   4) Verificación/rollback documentados al final.
-- ============================================================================

ALTER TABLE public.calendario_escolar ADD COLUMN IF NOT EXISTS periodo_id uuid;

-- Backfill por nombre exacto (normalizado como en normalizarCicloEscolar).
UPDATE public.calendario_escolar c
SET periodo_id = p.id
FROM public.periodos p
WHERE c.periodo_id IS NULL
  AND upper(btrim(c.ciclo_escolar)) = upper(btrim(p.nombre));

-- Índices.
CREATE INDEX IF NOT EXISTS calendario_escolar_periodo_idx
  ON public.calendario_escolar (periodo_id, fecha);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND tablename='calendario_escolar'
      AND indexname='calendario_escolar_periodo_fecha_unico'
  ) THEN
    CREATE UNIQUE INDEX calendario_escolar_periodo_fecha_unico
      ON public.calendario_escolar (periodo_id, fecha)
      WHERE periodo_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (documentado, no automático):
--   DROP INDEX IF EXISTS public.calendario_escolar_periodo_fecha_unico;
--   DROP INDEX IF EXISTS public.calendario_escolar_periodo_idx;
--   ALTER TABLE public.calendario_escolar DROP COLUMN IF EXISTS periodo_id;
-- ============================================================================
