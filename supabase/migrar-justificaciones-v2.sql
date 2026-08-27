-- ============================================================================
-- C4.25 — EXTENSIÓN ESTRUCTURAL DEL CIRCUITO DE JUSTIFICACIONES DE ASISTENCIA
-- ============================================================================
-- Reutiliza la tabla existente `justificaciones_asistencia` (no crea una
-- paralela). Añade:
--   1) Referencia al archivo adjunto (storage) en la propia justificación.
--   2) `motivo_rechazo` obligatorio cuando el directivo rechaza.
--   3) Tabla `mensajes_justificacion`: mensajes administrativos
--      directivo → tutor asociados a una justificación (leído/no leído).
--
-- NO se crea ninguna estructura académica ni de asistencia paralela.
-- La aprobación integra la asistencia mediante `asistencia_alumnos`
-- (marcador de profesor "__JUSTIFICACION__"), que el cálculo de estados
-- existente (SUM) reconoce de forma natural.
--
-- Requiere ejecutarse en Supabase → SQL Editor. Es idempotente (IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- 1) Referencia del archivo adjunto + motivo de rechazo en la justificación.
ALTER TABLE public.justificaciones_asistencia
  ADD COLUMN IF NOT EXISTS archivo_path text,
  ADD COLUMN IF NOT EXISTS archivo_nombre text,
  ADD COLUMN IF NOT EXISTS archivo_mime text,
  ADD COLUMN IF NOT EXISTS archivo_size bigint,
  ADD COLUMN IF NOT EXISTS motivo_rechazo text;

-- 2) Mensajes administrativos directivo → tutor (por justificación).
CREATE TABLE IF NOT EXISTS public.mensajes_justificacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  justificacion_id uuid NOT NULL
    REFERENCES public.justificaciones_asistencia(id) ON DELETE CASCADE,
  destinatario_tipo text NOT NULL DEFAULT 'tutor',
  destinatario_id text,
  mensaje text NOT NULL,
  leido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mensajes_justificacion_just_idx
  ON public.mensajes_justificacion (justificacion_id);
CREATE INDEX IF NOT EXISTS mensajes_justificacion_dest_idx
  ON public.mensajes_justificacion (destinatario_tipo, destinatario_id);

ALTER TABLE public.mensajes_justificacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensajes_justificacion_all"
  ON public.mensajes_justificacion
  FOR ALL USING (true) WITH CHECK (true);

-- 3) Bucket de Storage para los adjuntos (también se intenta crear desde la
--    Server Action con el cliente de servicio; aquí queda el DDL de respaldo).
--    Tamaño máximo recomendado: 5 MB. Tipos permitidos: PDF, PNG, JPG, JPEG.
--    Ruta: justificaciones/{curp}/{fecha}-{timestamp}.{ext}
--    (El bucket se puede crear desde el Dashboard: Storage → New bucket →
--     name: "justificaciones", public: false. Sin políticas públicas: el
--     acceso se controla con signed URLs desde las Server Actions.)
