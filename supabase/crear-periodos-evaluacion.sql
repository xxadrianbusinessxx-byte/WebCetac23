-- ============================================================================
-- FASE CICLO — PERIODOS DE EVALUACIÓN (parciales) POR CICLO ESCOLAR
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (PREPARADO, NO se ejecuta automáticamente)
--
-- MODELO:
--   periodos (ciclo escolar)            → periodos_evaluacion (parciales)
--     id, nombre, activo                  id, periodo_id, numero, nombre,
--     fecha_inicio, fecha_fin (ADITIVO)   fecha_inicio, fecha_fin, activo
--
-- REGLAS (congeladas en este módulo):
--   1) `periodos` es el CICLO ESCOLAR. Un parcial pertenece inequívocamente a
--      un ciclo vía `periodo_id` (FK). Nunca se repite el nombre del ciclo.
--   2) La cantidad de parciales es CONFIGURABLE (numero >= 1 sin tope duro);
--      el orden es explícito (numero) y estable.
--   3) Un parcial NO es el horario: `horario_semanal` sigue versionado por
--      `periodo_id` y no conoce parciales.
--   4) Un dato que dependa de una FECHA resuelve: fecha → ciclo → parcial
--      mediante lib/escolar/evaluaciones.ts (centralizado, sin N+1).
--   5) No solapamiento de rangos dentro del mismo ciclo (constraint opcional
--      con EXCLUDE + btree_gist; si no hay permiso, la capa de servicio lo
--      valida igualmente).
--   6) Históricos: nunca DELETE; desactivar = activo=false.
--   7) Columnas aditivas en `periodos` (fecha_inicio/fecha_fin) para poder
--      responder «¿esta fecha pertenece a qué ciclo?» sin depender del
--      calendario por día. Son OPCIONALES: un ciclo sin fechas sigue
--      funcionando (los parciales definen sus segmentos).
-- ============================================================================

-- ============================================================================
-- 1) COLUMNAS ADITIVAS EN periodos (rangos del ciclo)
-- ============================================================================
ALTER TABLE public.periodos ADD COLUMN IF NOT EXISTS fecha_inicio date;
ALTER TABLE public.periodos ADD COLUMN IF NOT EXISTS fecha_fin date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'periodos_rango_fechas_check'
  ) THEN
    ALTER TABLE public.periodos
      ADD CONSTRAINT periodos_rango_fechas_check
      CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin >= fecha_inicio);
  END IF;
END $$;

-- ============================================================================
-- 2) TABLA periodos_evaluacion
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.periodos_evaluacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES public.periodos (id) ON DELETE RESTRICT,
  numero smallint NOT NULL CHECK (numero >= 1),
  nombre text NOT NULL,                 -- presentación, ej. "Parcial 1"
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Invariantes básicos.
  CONSTRAINT periodos_evaluacion_rango_check CHECK (fecha_fin >= fecha_inicio),
  -- Un ciclo no puede tener dos parciales con el mismo orden ni el mismo nombre.
  CONSTRAINT periodos_evaluacion_periodo_numero_key UNIQUE (periodo_id, numero),
  CONSTRAINT periodos_evaluacion_periodo_nombre_key UNIQUE (periodo_id, nombre)
);

-- ============================================================================
-- 3) ÍNDICES
-- ============================================================================
-- Consulta de resolución: «parciales de un ciclo» y «¿qué parcial contiene
-- esta fecha?». Con (periodo_id) el filtro por ciclo es trivial; el rango
-- sirve para barrer pocas filas cuando se resuelve fecha → parcial.
CREATE INDEX IF NOT EXISTS periodos_evaluacion_periodo_idx
  ON public.periodos_evaluacion (periodo_id);
CREATE INDEX IF NOT EXISTS periodos_evaluacion_rango_idx
  ON public.periodos_evaluacion (periodo_id, fecha_inicio, fecha_fin);

-- ============================================================================
-- 4) NO SOLAPAMIENTO (opcional, requiere btree_gist). Si el rol no puede crear
--    la extensión, se omite con NOTICE; la capa de servicio igual lo valida.
-- ============================================================================
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'periodos_evaluacion_no_overlap'
  ) THEN
    ALTER TABLE public.periodos_evaluacion
      ADD CONSTRAINT periodos_evaluacion_no_overlap
      EXCLUDE USING gist (
        periodo_id WITH =,
        daterange(fecha_inicio, fecha_fin, '[]') WITH &&
      );
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'No se pudo crear la constraint de no solapamiento (btree_gist). La capa de servicio valida los rangos.';
END $$;

-- ============================================================================
-- 5) Trigger updated_at (mismo patrón del proyecto, idempotente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'periodos_evaluacion_set_updated_at'
  ) THEN
    CREATE TRIGGER periodos_evaluacion_set_updated_at
      BEFORE UPDATE ON public.periodos_evaluacion
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 6) RLS pública (mismo patrón del proyecto: las Server Actions autorizan)
-- ============================================================================
ALTER TABLE public.periodos_evaluacion ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'periodos_evaluacion'
      AND policyname = 'periodos_evaluacion_all'
  ) THEN
    CREATE POLICY "periodos_evaluacion_all"
      ON public.periodos_evaluacion
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- VERIFICACIÓN (ejecutar tras aplicar):
--   SELECT p.nombre AS ciclo, e.numero, e.nombre, e.fecha_inicio, e.fecha_fin
--   FROM public.periodos_evaluacion e
--   JOIN public.periodos p ON p.id = e.periodo_id
--   ORDER BY p.nombre, e.numero;
-- ============================================================================

