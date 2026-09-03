-- ============================================================================
-- HORARIO SEMANAL OFICIAL — Modelo de datos (FASE HORARIO)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (preparado, NO se ejecuta automáticamente)
--
-- OBJETIVO:
--   Fuente única de verdad de «qué clases están programadas para un grupo en
--   un día de la semana», versionada por periodo/ciclo escolar. Sustituye a
--   `configuracion_clases_profesor` como autoridad de la cantidad de clases.
--
-- PRINCIPIOS (congelados en este módulo):
--   1) El horario responde «¿qué clases están programadas?». La asistencia
--      (clases_impartidas / asistencia_alumnos) responde «¿qué ocurrió?».
--      El horario NO genera filas de asistencia ni de clases_impartidas.
--   2) NO se duplica la oferta: se referencia a `periodos` y `grupos`
--      existentes del catálogo académico mediante FKs.
--   3) La materia del horario se conserva como texto oficial del archivo
--      (materia_clave + materia_nombre). `materia_id` es un vínculo OPCIONAL
--      (best-effort) al catálogo cuando el nombre se resuelve de forma única.
--      NO se exige que el catálogo esté completo para poder importar.
--   4) El profesor se conserva como texto visible (profesor_nombre) y como
--      clave OPCIONAL (profesor_clave) cuando existe una resolución segura.
--      «Sin profesor asignado» se representa como NULL: NUNCA se convierte en
--      un profesor real.
--   5) NO se almacena el «resumen de clases por día» del Excel: es un dato
--      DERIVADO del detalle (COUNT de bloques) y solo se usa como validación
--      cruzada durante la importación.
--   6) La importación es idempotente por clave natural
--      (periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave) y usa
--      estrategia de reemplazo-diferenciado por periodo en la capa de servicio
--      (nunca DELETE masivo seguido de INSERT masivo a ciegas).
--   7) NO se crea una tabla por grupo, por alumno ni por materia. NO hay
--      registros diarios del horario para ningún alumno.
-- ============================================================================

-- ============================================================================
-- 1) TABLA horario_semanal
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.horario_semanal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES public.periodos (id) ON DELETE RESTRICT,
  grupo_id uuid NOT NULL REFERENCES public.grupos (id) ON DELETE RESTRICT,
  -- Día de la semana (lunes..viernes). Sin acentos, consistente con DIAS_SEMANA
  -- de lib/escolar/calendario.ts.
  dia_semana text NOT NULL
    CHECK (dia_semana IN ('lunes','martes','miercoles','jueves','viernes')),
  hora_inicio time NOT NULL,            -- ej. '07:30'
  hora_fin time NOT NULL,               -- ej. '09:10'
  -- Identidad de la materia DENTRO DEL HORARIO (texto oficial del archivo,
  -- normalizado sin acentos/mayúsculas). NO depende del catálogo.
  materia_clave text NOT NULL,
  materia_nombre text NOT NULL,         -- nombre visible oficial (del archivo)
  -- Vínculo opcional al catálogo académico (best-effort en importación).
  materia_id uuid REFERENCES public.materias (id) ON DELETE RESTRICT,
  -- Tipo de clase normalizado (academica | taller | modulo tecnico | ...).
  tipo_clase text NOT NULL DEFAULT 'academica',
  -- Profesor visible en el horario. NULL = «Sin profesor asignado».
  profesor_nombre text,
  -- Clave de profesor resuelta de forma SEGURA (opcional; normalmente NULL
  -- porque el nombre del archivo no es identidad estable).
  profesor_clave text,
  -- Número de fila dentro de la hoja de origen (trazabilidad).
  fila_origen integer,
  creado_por text,                      -- directivo que importó
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- La hora de fin debe ser posterior a la de inicio.
  CONSTRAINT horario_semanal_horas_check CHECK (hora_fin > hora_inicio),
  -- Clave natural para idempotencia de importación: re-subir el mismo archivo
  -- (o una fila idéntica) NO duplica.
  CONSTRAINT horario_semanal_unico
    UNIQUE (periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave)
);

-- ============================================================================
-- 2) ÍNDICES
-- ============================================================================
-- Índices para las consultas del módulo (una consulta por grupo/periodo):
--   · Horario de un grupo en un día (profesor, alumno, tutor, directivo).
--   · Conteo derivado de clases por día (COUNT por periodo+grupo+dia).
CREATE INDEX IF NOT EXISTS horario_semanal_periodo_grupo_dia_idx
  ON public.horario_semanal (periodo_id, grupo_id, dia_semana);
CREATE INDEX IF NOT EXISTS horario_semanal_periodo_grupo_idx
  ON public.horario_semanal (periodo_id, grupo_id);
-- Consulta por profesor resuelto (periodo + profesor).
CREATE INDEX IF NOT EXISTS horario_semanal_profesor_idx
  ON public.horario_semanal (periodo_id, profesor_clave)
  WHERE profesor_clave IS NOT NULL;
-- Consulta por materia vinculada al catálogo.
CREATE INDEX IF NOT EXISTS horario_semanal_materia_idx
  ON public.horario_semanal (materia_id)
  WHERE materia_id IS NOT NULL;

-- ============================================================================
-- 2) Trigger updated_at (mismo patrón que el resto del proyecto).
-- ============================================================================
DROP TRIGGER IF EXISTS horario_semanal_set_updated_at ON public.horario_semanal;
CREATE TRIGGER horario_semanal_set_updated_at
  BEFORE UPDATE ON public.horario_semanal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 3) RLS: mismo patrón del proyecto (las Server Actions controlan el acceso;
--    no se exponen tablas al cliente).
-- ============================================================================
ALTER TABLE public.horario_semanal ENABLE ROW LEVEL SECURITY;

-- Idempotente: Postgres no soporta CREATE POLICY IF NOT EXISTS, por lo que
-- primero se elimina la política (si existe) y luego se crea.
DROP POLICY IF EXISTS "horario_semanal_all" ON public.horario_semanal;
CREATE POLICY "horario_semanal_all" ON public.horario_semanal
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4) Documentación de la decisión.
-- ============================================================================
COMMENT ON TABLE public.horario_semanal IS
  'Horario semanal oficial por periodo/ciclo (fuente única de verdad de bloques
   programados). NO es asistencia: clases_impartidas/asistencia_alumnos
   registran lo ocurrido. La cantidad de clases por día se DERIVA contando
   bloques; nunca se almacena por separado. Introducido en la FASE HORARIO.';

COMMENT ON TABLE public.configuracion_clases_profesor IS
  'LEGACY DEPRECATED (FASE HORARIO): cantidad manual de clases por día por
   profesor. Perdió autoridad cuando existe horario_semanal para el grupo y el
   periodo. Se conserva por compatibilidad aditiva (migración en fases) pero NO
   debe usarse como fuente en flujos nuevos. Alternativa: lib/escolar/
   horario-semanal.ts (horario oficial) -> bloques programados.';

-- ============================================================================
-- NOTA OPERATIVA
--   · Crear tabla: ejecutar este archivo.
--   · No elimina nada existente; no modifica clases_impartidas ni
--     asistencia_alumnos ni las tablas del catálogo.
--   · La tabla de importaciones/reportes NO se crea: la importación genera el
--     reporte en la capa de servicio (preview) sin persistirlo.
-- ============================================================================
