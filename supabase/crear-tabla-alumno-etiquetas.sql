-- ============================================================================
-- MÓDULO ETIQUETAS DINÁMICAS — alumno_etiquetas (FASE 2 · PASO 2)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- Objetivo:
--   Tabla relacionada que reemplaza CONCEPTUALMENTE a los pares legacy
--   EMPTY1..EMPTY3 (título) / EMPTY4..EMPTY6 (valor) de "ETIQUETAS PERSONALES".
--   Máximo 20 etiquetas por alumno (regla de negocio con protección en BD).
--
-- Convenciones respetadas (ver crear-tablas-catalogo-academico.sql):
--   · Los módulos nuevos usan snake_case en minúsculas (como inscripciones_alumno).
--   · RLS pública + autorización de negocio en Server Actions (patrón del
--     proyecto). alumno_etiquetas NO debe modificarse directamente desde el
--     cliente: toda escritura pasa por el módulo/servicio de etiquetas.
--   · updated_at mediante public.set_updated_at() (mismo trigger del proyecto).
--   · Sin FK a tablas legacy ("ALUMNOS"); la existencia del CURP se valida en
--     la capa de aplicación (mismo criterio que inscripciones_alumno).
--
-- Este SQL es IDEMPOTENTE: CREATE TABLE IF NOT EXISTS + índices IF NOT EXISTS +
-- guardas en triggers y políticas. NO borra ni modifica tablas existentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.alumno_etiquetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curp text NOT NULL,                        -- identificador del alumno (ALUMNOS.CURP)
  titulo text NOT NULL,                      -- título presentado (ej. "Deporte")
  valor text NOT NULL DEFAULT '',            -- valor (puede quedar vacío)
  orden integer NOT NULL DEFAULT 0,          -- posición de presentación (0..n)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- El título no puede ser vacío: la unicidad lower() requiere un valor real.
  CONSTRAINT alumno_etiquetas_titulo_no_vacio CHECK (btrim(titulo) <> ''),
  -- Orden nunca negativo (mismo criterio que CHECK (clases >= 0) de asistencia).
  CONSTRAINT alumno_etiquetas_orden_no_negativo CHECK (orden >= 0)
);

-- Un alumno no puede tener dos etiquetas con el mismo título ignorando
-- mayúsculas/minúsculas y espacios laterales (el servicio aplica trim antes de
-- guardar). Es una UNIQUE por EXPRESIÓN: lower(titulo).
CREATE UNIQUE INDEX IF NOT EXISTS alumno_etiquetas_curp_titulo_key
  ON public.alumno_etiquetas (curp, lower(titulo));

-- Lectura de TODAS las etiquetas de un alumno en orden de presentación.
CREATE INDEX IF NOT EXISTS alumno_etiquetas_curp_orden_idx
  ON public.alumno_etiquetas (curp, orden);

-- Consultas por CURP (importación global, reportes, conteo del límite).
CREATE INDEX IF NOT EXISTS alumno_etiquetas_curp_idx
  ON public.alumno_etiquetas (curp);

-- ============================================================================
-- MÁXIMO DE 20 ETIQUETAS POR ALUMNO (protección de base de datos)
-- ============================================================================
-- El máximo es una regla de NEGOCIO. La validación principal vive en el
-- SERVICIO (Paso 3 de la Fase 2); este trigger es la red de seguridad que hace
-- imposible saltarse el límite desde una Server Action defectuosa o una
-- escritura directa contra la tabla.
--
-- Comportamiento:
--   · INSERT de un título NUEVO para un CURP que ya tiene 20 etiquetas
--     → EXCEPCIÓN (error de validación de check).
--   · INSERT que coincide con un título existente (ON CONFLICT DO UPDATE /
--     DO NOTHING) → se permite: no es un alta nueva, el conflicto lo resuelve
--     el índice único (curp, lower(titulo)).
--   · UPDATE de una fila existente → el trigger es BEFORE INSERT, no interviene.
--
-- Limitación conocida (documentada): sin aislamiento SERIALIZABLE, dos INSERT
-- concurrentes sobre el MISMO CURP podrían cruzar el límite en una carrera.
-- A la escala del proyecto (escrituras casi siempre serializadas por CURP) es
-- aceptable como red de seguridad; la validación del servicio sigue siendo la
-- barrera principal.
CREATE OR REPLACE FUNCTION public.alumno_etiquetas_verificar_limite()
RETURNS trigger AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.alumno_etiquetas
  WHERE curp = NEW.curp;

  IF v_total >= 20 AND NOT EXISTS (
    SELECT 1 FROM public.alumno_etiquetas
    WHERE curp = NEW.curp AND lower(titulo) = lower(NEW.titulo)
  ) THEN
    RAISE EXCEPTION 'Límite de 20 etiquetas por alumno alcanzado (CURP: %)', NEW.curp
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alumno_etiquetas_limite_20 ON public.alumno_etiquetas;
CREATE TRIGGER alumno_etiquetas_limite_20
  BEFORE INSERT ON public.alumno_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.alumno_etiquetas_verificar_limite();

-- ============================================================================
-- Trigger para mantener updated_at (misma función que el resto del proyecto).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS alumno_etiquetas_set_updated_at ON public.alumno_etiquetas;
CREATE TRIGGER alumno_etiquetas_set_updated_at
  BEFORE UPDATE ON public.alumno_etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- RLS (patrón deliberado del proyecto)
-- ============================================================================
-- RLS pública: la AUTORIZACIÓN de negocio se valida SIEMPRE en las Server
-- Actions (sesión + rol + alumno objetivo + relación). alumno_etiquetas NO
-- debe escribirse desde el cliente; los únicos caminos de escritura son el
-- módulo/servicio de etiquetas (Server Actions, Fase 2 · Paso 3+).
ALTER TABLE public.alumno_etiquetas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'alumno_etiquetas'
      AND policyname = 'alumno_etiquetas_all'
  ) THEN
    CREATE POLICY "alumno_etiquetas_all"
      ON public.alumno_etiquetas
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- NOTA SOBRE LA FK A ALUMNOS
-- ============================================================================
-- NO se crea FK a "ALUMNOS" por decisión explícita, siguiendo el patrón del
-- catálogo académico (inscripciones_alumno.curp y asignaciones_profesor.
-- profesor_clave tampoco tienen FK a tablas legacy): la existencia del CURP se
-- valida en la capa de aplicación. Motivos:
--   1) "ALUMNOS" es una tabla legacy con nombre con espacios; los módulos
--      nuevos mantienen esa separación (validación en capa, no FK).
--   2) Evita acoplar este módulo (reemplazable) a la implementación física de
--      ALUMNOS.
-- La columna curp se normaliza (trim + mayúsculas) en la capa de servicio,
-- igual que en el resto del proyecto.

-- ============================================================================
-- VERIFICACIÓN (ejecutar en SQL Editor tras aplicar):
--   SELECT count(*) FROM public.alumno_etiquetas;
--   SELECT * FROM public.alumno_etiquetas ORDER BY curp, orden LIMIT 20;
--   \d public.alumno_etiquetas
-- ============================================================================

