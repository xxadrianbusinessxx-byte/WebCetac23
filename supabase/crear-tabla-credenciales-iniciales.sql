-- ============================================================================
-- BLOQUE 6L: CREDENCIALES INICIALES MULTI-HIJO DE TUTORES
-- ============================================================================
-- Permite que un tutor con 2+ hijos pueda iniciar sesión con los últimos 8
-- caracteres del CURP de CUALQUIERA de sus hijos (no solo del alumno de
-- referencia). Cada fila guarda el hash scrypt de la contraseña inicial
-- derivada de UN hijo concreto.
--
-- Reglas:
--   - La contraseña se guarda SIEMPRE como hash scrypt (nunca texto plano).
--   - Una fila por (tutor, hijo). UNIQUE (tutor_id, curp_alumno).
--   - Cuando el tutor cambia sus credenciales (debe_cambiar_credenciales=false),
--     estas filas se ELIMINAN para que las contraseñas iniciales dejen de ser
--     válidas.
--   - ON DELETE CASCADE: si se borra el tutor, se borran sus credenciales.
--
-- Este script es SEGURO de ejecutar: usa IF NOT EXISTS y no borra ni modifica
-- tablas existentes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tutor_credenciales_iniciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.tutores (id) ON DELETE CASCADE,
  curp_alumno text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Un tutor no puede tener dos credenciales iniciales para el mismo hijo.
CREATE UNIQUE INDEX IF NOT EXISTS tutor_credenciales_iniciales_tutor_curp_key
  ON public.tutor_credenciales_iniciales (tutor_id, curp_alumno);

-- Índice para consultar las credenciales iniciales de un tutor al verificar
-- el login (acepta cualquiera de sus hijos).
CREATE INDEX IF NOT EXISTS tutor_credenciales_iniciales_tutor_idx
  ON public.tutor_credenciales_iniciales (tutor_id);

-- Trigger para mantener `updated_at` actualizado.
DROP TRIGGER IF EXISTS tutor_credenciales_iniciales_set_updated_at
  ON public.tutor_credenciales_iniciales;
CREATE TRIGGER tutor_credenciales_iniciales_set_updated_at
  BEFORE UPDATE ON public.tutor_credenciales_iniciales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: por defecto deshabilitado (el acceso se controla desde las Server
-- Actions con la sesión del portal), igual que las demás tablas de tutores.
ALTER TABLE public.tutor_credenciales_iniciales ENABLE ROW LEVEL SECURITY;

-- Políticas mínimas para que las Server Actions puedan operar.
CREATE POLICY "tutor_credenciales_iniciales_all"
  ON public.tutor_credenciales_iniciales
  FOR ALL USING (true) WITH CHECK (true);
