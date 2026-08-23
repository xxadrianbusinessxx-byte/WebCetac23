-- ============================================================================
-- BLOQUE 6B: JUSTIFICACIONES DE ASISTENCIA
-- ============================================================================
-- Crea la tabla `justificaciones_asistencia` para que un tutor (o el alumno)
-- pueda justificar una FALTA registrada de un alumno en una fecha concreta.
--
-- Diseño aprobado:
--   · La justificación NO altera los datos de asistencia (asistencia_alumnos).
--     Es un registro independiente que documenta el motivo de una falta.
--   · La falta sigue siendo falta; la justificación es un dato adjunto.
--   · `estado` permite que el directivo la apruebe/rechace más adelante.
--   · `curp_alumno` es el identificador principal del alumno (CURP).
--   · `solicitante_tipo` indica quién la pidió (tutor o alumno).
--   · `solicitante_id` guarda el id del tutor (si aplica) o la matrícula del
--     alumno, para trazabilidad.
--
-- Reglas:
--   · Un alumno/fecha solo puede tener UNA justificación activa (UNIQUE sobre
--     curp_alumno + fecha). Re-solicitar actualiza (UPSERT), no duplica.
--   · NO se almacena el porcentaje ni se modifica la asistencia aquí.
--
-- Este script es SEGURO de ejecutar: usa IF NOT EXISTS y no borra ni modifica
-- tablas existentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.justificaciones_asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curp_alumno text NOT NULL,
  fecha date NOT NULL,
  grado text,
  grupo text,
  carrera text,
  motivo text NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  solicitante_tipo text NOT NULL DEFAULT 'tutor'
    CHECK (solicitante_tipo IN ('tutor', 'alumno')),
  solicitante_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un alumno solo puede tener una justificación por fecha.
CREATE UNIQUE INDEX IF NOT EXISTS justificaciones_curp_fecha_key
  ON public.justificaciones_asistencia (curp_alumno, fecha);

-- Índice para consultar las justificaciones de un alumno.
CREATE INDEX IF NOT EXISTS justificaciones_curp_idx
  ON public.justificaciones_asistencia (curp_alumno);

-- Índice para consultar por estado (p.ej. pendientes de revisión).
CREATE INDEX IF NOT EXISTS justificaciones_estado_idx
  ON public.justificaciones_asistencia (estado);

-- ---------------------------------------------------------------------------
-- Trigger para mantener `updated_at` actualizado.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS justificaciones_asistencia_set_updated_at
  ON public.justificaciones_asistencia;
CREATE TRIGGER justificaciones_asistencia_set_updated_at
  BEFORE UPDATE ON public.justificaciones_asistencia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: por defecto deshabilitado (el acceso se controla desde las Server
-- Actions con la sesión del portal). Si se desea activar RLS más adelante,
-- se debe hacer de forma explícita y con políticas por rol.
-- ---------------------------------------------------------------------------
ALTER TABLE public.justificaciones_asistencia ENABLE ROW LEVEL SECURITY;

-- Política mínima para que las Server Actions (que usan el rol de la app)
-- puedan operar. Ajusta según el rol de la conexión de Supabase.
CREATE POLICY "justificaciones_asistencia_all"
  ON public.justificaciones_asistencia
  FOR ALL USING (true) WITH CHECK (true);
