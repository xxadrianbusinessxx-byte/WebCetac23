-- ============================================================================
-- SISTEMA DE ASISTENCIAS — Esquema de base de datos (BLOQUE 4 — VERSIÓN FINAL)
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor
--
-- Este SQL SOLO CREA tablas nuevas. NO borra ni modifica tablas existentes.
-- Es seguro de ejecutar (usa CREATE TABLE IF NOT EXISTS).
--
-- Convención de nombres:
--   · Tablas de sistema del proyecto usan MAYÚSCULAS con espacios/paréntesis
--     (ej. "ETIQUETAS (STATUS)", "COMENTARIOS PROFESORES").
--   · Módulos nuevos (documentos, calificaciones) usan snake_case en minúsculas
--     (ej. "CARPETAS", "DOCUMENTOS", "archivos_calificaciones").
--   · Para asistencias seguimos la convención de los módulos nuevos (snake_case),
--     coherente con "archivos_calificaciones" y "CARPETAS"/"DOCUMENTOS".
--
-- DECISIONES ARQUITECTÓNICAS CLAVE:
--   1) Identidad del profesor = profesor_clave (CLAVE/MATRÍCULA de PROFESORES),
--      NO el nombre. El nombre no es una identidad estable.
--   2) NO se almacena clases_totales en asistencia_alumnos: el total del grupo
--      se calcula con SUM(clases_impartidas.clases) por grado+grupo+fecha.
--   3) NO existe tabla por grupo: asistencia_alumnos es una tabla común con
--      grado/grupo/carrera como datos (no nombres dinámicos de tablas).
--   4) NO se almacena porcentaje: es derivado (asistidas / total).
--   5) NO se crea tabla de plantillas/auditoría: no aporta valor al flujo
--      inicial y el objetivo es mantener el sistema ligero.
-- ============================================================================

-- ============================================================================
-- 1) CALENDARIO ESCOLAR GLOBAL
--    Fuente de verdad de qué días son días válidos de clase.
--    Un día festivo / mantenimiento / descanso NO es día escolar.
-- ============================================================================
CREATE TABLE IF NOT EXISTS "calendario_escolar" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_escolar text NOT NULL,          -- ej. "2026-2027"
  fecha date NOT NULL,                  -- día concreto
  tipo text NOT NULL DEFAULT 'clase'
    CHECK (tipo IN ('clase','festivo','mantenimiento','descanso')),
  descripcion text,                     -- motivo opcional (ej. "Día de la Independencia")
  creado_por text,                      -- nombre del directivo que lo configuró
  created_at timestamptz DEFAULT now(),
  -- Un mismo día no puede tener dos configuraciones dentro del mismo ciclo.
  CONSTRAINT calendario_escolar_unico UNIQUE (ciclo_escolar, fecha)
);

-- Índice para consultar rápidamente los días de clase de un ciclo
-- (generación de plantillas: WHERE ciclo_escolar = $1 AND tipo = 'clase').
CREATE INDEX IF NOT EXISTS calendario_escolar_ciclo_idx
  ON "calendario_escolar" (ciclo_escolar, fecha);

-- ============================================================================
-- 2) CLASES IMPARTIDAS POR PROFESOR (por grado + grupo + fecha)
--    Registra cuántas clases impartió cada profesor en un grupo en una fecha.
--    La identidad del profesor es su CLAVE/MATRÍCULA (profesor_clave), NO el
--    nombre. La operación es UPSERT (estado actual), NUNCA acumulación.
--    La UNIQUE (profesor_clave, grado, grupo, fecha) garantiza que re-subir la
--    misma plantilla NO sume: 3 → 3, y que modificar 3 → 4 quede en 4.
-- ============================================================================
CREATE TABLE IF NOT EXISTS "clases_impartidas" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor_clave text NOT NULL,         -- CLAVE/MATRÍCULA del profesor (identidad estable)
  grado text NOT NULL,                  -- ej. "1RO"
  grupo text NOT NULL,                  -- ej. "A"
  carrera text,                         -- ej. "RH" (opcional, para desambiguar)
  fecha date NOT NULL,                  -- día escolar exacto
  clases integer NOT NULL DEFAULT 0
    CHECK (clases >= 0),                -- nunca negativo
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Clave natural: un profesor solo tiene UN valor de clases por grupo+fecha.
  CONSTRAINT clases_impartidas_unico UNIQUE (profesor_clave, grado, grupo, fecha)
);

-- Índice para responder: "¿cuántas clases impartió cada profesor de este grupo
-- en esta fecha?" y para SUM() del total del grupo por fecha.
CREATE INDEX IF NOT EXISTS clases_impartidas_grupo_fecha_idx
  ON "clases_impartidas" (grado, grupo, fecha);

-- Índice para consultar el historial de un profesor concreto (perfil profesor).
CREATE INDEX IF NOT EXISTS clases_impartidas_profesor_idx
  ON "clases_impartidas" (profesor_clave, fecha);

-- ============================================================================
-- 3) ASISTENCIA POR ALUMNO (tabla común, NO una tabla por grupo)
--    Almacena por alumno + fecha las clases a las que asistió.
--    CURP es el identificador principal del alumno (NO el nombre).
--    El nombre se conserva como dato visible, pero NO es llave.
--    NO se almacena clases_totales ni porcentaje: ambos son derivados.
--    El total del grupo se calcula con SUM(clases_impartidas.clases).
-- ============================================================================
CREATE TABLE IF NOT EXISTS "asistencia_alumnos" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curp text NOT NULL,                   -- identificador principal del alumno
  grado text NOT NULL,                  -- ej. "1RO"
  grupo text NOT NULL,                  -- ej. "A"
  carrera text,                         -- ej. "RH" (opcional)
  nombre text,                          -- dato visible (NO es llave)
  fecha date NOT NULL,                  -- día escolar exacto
  clases_asistidas integer NOT NULL DEFAULT 0
    CHECK (clases_asistidas >= 0),      -- clases a las que asistió el alumno
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Un alumno solo tiene UN registro de asistencia por grupo+fecha.
  CONSTRAINT asistencia_alumnos_unico UNIQUE (curp, grado, grupo, fecha)
);

-- Índice para consultar la asistencia de un alumno (perfil alumno/padre).
CREATE INDEX IF NOT EXISTS asistencia_alumnos_curp_idx
  ON "asistencia_alumnos" (curp, fecha);

-- Índice para consultar la asistencia de todo un grupo en una fecha
-- (plantillas, reportes del directivo).
CREATE INDEX IF NOT EXISTS asistencia_alumnos_grupo_fecha_idx
  ON "asistencia_alumnos" (grado, grupo, fecha);

-- ============================================================================
-- NOTA SOBRE EL TOTAL GLOBAL DEL GRUPO Y EL PORCENTAJE
-- ============================================================================
-- El total de clases del grupo para una fecha se calcula con:
--   SELECT COALESCE(SUM(clases), 0) FROM "clases_impartidas"
--   WHERE grado = $1 AND grupo = $2 AND fecha = $3;
--
-- El porcentaje de asistencia de un alumno se calcula como:
--   clases_asistidas / (total del grupo para esa fecha)
--
-- Ambos son DATOS DERIVADOS y NO se almacenan. Se calculan en el momento de la
-- consulta (desde TypeScript o una view/función posterior). Esto garantiza
-- consistencia: si un profesor cambia 3 → 4, el total y el porcentaje se
-- recalculan automáticamente y nunca quedan desincronizados.
--
-- El índice (grado, grupo, fecha) en "clases_impartidas" hace el SUM trivial
-- incluso con el volumen esperado (pocos profesores × días escolares).
-- ============================================================================
