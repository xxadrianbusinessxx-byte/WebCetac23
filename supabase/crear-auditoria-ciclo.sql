-- ============================================================================
-- F4 — AUDITORÍA MÍNIMA DE TRANSICIONES DE CICLO
-- Tabla `ciclo_transiciones`. ADITIVA, IDEMPOTENTE, SIN DELETE/DROP de datos.
-- La escritura desde la app es NO BLOQUEANTE (registrarTransicionCiclo).
-- Ejecutar en Supabase SQL Editor (no hay ejecutor automático).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ciclo_transiciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid REFERENCES public.periodos (id) ON DELETE RESTRICT,
  operacion text NOT NULL,
  estado_anterior text,
  estado_nuevo text,
  actor text,
  resultado text NOT NULL,
  detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ciclo_transiciones_periodo_idx ON public.ciclo_transiciones (periodo_id, created_at);
