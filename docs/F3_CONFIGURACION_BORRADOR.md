# F3 — Configuración académica completa de ciclos BORRADOR

**Fase:** F3 · Preparación de un ciclo sin activarlo, manteniendo intacto el
ciclo OPERATIVO actual. No toca calendario/horario/asistencias/roster/vistas
(F5–F7).

## 1. Auditoría inicial (activo=true)

Funciones que exigían `activo=true` y su clasificación:

**A. Administrativas (ahora permiten BORRADOR/OPERATIVO):**
- Guardar parciales (`guardarPeriodoEvaluacion`) — ajustado en F1.
- Configurar semestres (`setEstadoSemestre`) — ajustado en F1.
- Crear ciclo (`crearCicloEscolar`) — F1: nace BORRADOR.
- Clonar contexto académico (`clonarContextoAcademico`) — ya no exige activo.
- **Nuevas (F3):** listar grupos de un periodo, buscar alumnos candidatos e
  inscribir alumnos en un periodo explícito (`lib/escolar/inscripciones-borrador.ts`).

**B. Operativas (siguen usando `activo=true` deliberadamente):**
- `resolverGrupoAlumno()` (identidad del alumno actual): NO se modificó.
- `actionObtenerCicloActual`, `listarGruposAsistencia`, carga/roster operativo,
  vistas actuales: consumen el ciclo operativo.

Regla de separación:
`ADMINISTRAR BORRADOR = periodo_id + estado permitido` · `OPERACIÓN ACTUAL =
ciclo activo`.

## 2. Funciones nuevas

- `lib/escolar/inscripciones-borrador.ts`:
  - `listarGruposPeriodoAdmin(supabase, periodoId)` (grupos + carrera).
  - `buscarAlumnosCandidatos(supabase, texto)` (búsqueda acotada, ~460 alumnos,
    sin N+1; `select(*)` + filtro en memoria por CURP/nombre).
  - `inscribirAlumnoEnCiclo(supabase, { curp, grupoId, periodoId? })`.
- `app/actions/inscripciones-admin.ts`: `actionListarGruposPeriodo`,
  `actionBuscarAlumnosInscripcion`, `actionInscribirAlumnoEnCiclo` (todas rol
  `directivo`).

## 3. Reglas de inscripción (servidor)

- Alumno debe existir (`ALUMNOS`).
- Grupo debe existir, estar **activo** y pertenecer al `periodoId` indicado
  (referencias cruzadas entre ciclos **bloqueadas**).
- Estado del periodo permite preparación: HISTORICO bloqueado (esquema F1);
  sin esquema F1 se mantiene compatibilidad.
- Duplicado en el mismo grupo → **bloqueado** (no duplica).
- BORRADOR → fila con `activo=false` (no contamina la resolución actual).
- OPERATIVO → fila `activo=true` y se desactivan otras activas del alumno.

## 4. Activación y sincronización de inscripciones (F1/F3)

`activarCicloOperativo()` ahora ejecuta `sincronizarInscripcionesOperativo()`:
dentro del ciclo que queda OPERATIVO activa **solo la fila más reciente por
CURP** y desactiva las demás; las filas activas de otros ciclos pasan a
`activo=false`. No crea ni mueve filas; es idempotente.


## 5. UI (extensión mínima sobre el panel F2)

En `ciclo-evaluaciones-admin.tsx`, dentro del detalle de un ciclo (BORRADOR u
OPERATIVO, nunca HISTORICO) se agregó «Registrar alumnos (preparación
académica)»: búsqueda de alumno por CURP/nombre, selector de grupo del propio
ciclo (con `periodo_id` implícito) y botón de registro. Los conteos de
integridad se refrescan tras cada inscripción (`cargarDetalle`). No se creó una
sección administrativa independiente.

## 6. Seguridad

`periodo_id`/`grupo_id` no son de confianza: la Server Action valida sesión,
rol directivo, existencia del periodo, estado permitido, existencia del alumno y
pertenencia del grupo al periodo antes de escribir. La UI solo ayuda a elegir.

## 7. Compatibilidad con `activo`

- `activo` conserva su significado: «ciclo actualmente operativo».
- Configurar BORRADOR no cambia `activo` de ningún ciclo ni llama a
  `setActivoCiclo()`.
- La migración `supabase/agregar-estado-ciclo.sql` sigue pendiente (sin acceso
  DDL): sin ella el código opera en modo compatibilidad (no distingue
  borrador/historico) y lo reporta. No se ejecutó DDL por REST.

## 8. Lo que NO se modificó (F5–F7)

`calendario_escolar`, `clases_impartidas`, `asistencia_alumnos`,
`justificaciones_asistencia`, roster/horario, generación de archivos, vistas
alumno/tutor, migración de horario y `resolverGrupoAlumno()`. No se copiaron ni
movieron alumnos automáticamente.

## 9. Pruebas

- `scripts/test-inscripciones-f3.mjs` (13/13): inscripción válida en BORRADOR,
  duplicado bloqueado, grupo de otro periodo bloqueado, alumno inexistente
  bloqueado, configuración de B sin alterar A (anti-P0), HISTORICO bloqueado y
  resolución del alumno operativo intacta.
- `scripts/test-ciclo-estado.mjs`: 24/24 (incluye anti-P0).
- `scripts/test-evaluaciones.mjs`: 30/30.
- `npx tsc --noEmit` = 0 · ESLint = 0 · `npm run build` = exit 0.

## 10. Riesgos para F4/F5

1. Sigue pendiente aplicar `agregar-estado-ciclo.sql` (SQL Editor) para
   distinguir BORRADOR/HISTORICO en producción.
2. La sincronización de inscripciones al activar es secuencial (REST, sin
   transacción SQL); es idempotente y reintentable, pero una transacción
   `plpgsql` la haría atómica (opcional en fases futuras).
3. El roster/carga por Excel sigue filtrando `activo=true`; F4/F5 deberá
   permitir usar un BORRADOR explícito como destino de carga/previsualización.
4. Los datos legacy (claves de profesor duplicadas, 4 inscripciones en
   `2DO A RH`) siguen requiriendo decisión del directivo.

