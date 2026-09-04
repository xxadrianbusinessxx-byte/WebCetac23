# INFORME — Prompt C: `profesor_id` como identidad + atribución de materias al subir asistencias

Fecha: 2026-09-04 · Ejecutado según `docs/PROMPT_CLINE_C_ATRIBUCION_PROFESOR.md`.
No se ejecutó SQL (R-1 queda preparado, idempotente y documentado para el directivo).

---

## Implementado

### R-1 · Esquema aditivo e idempotente (SQL preparado, NO ejecutado)
`supabase/agregar-atribucion-profesor-asistencia.sql`:

- `clases_impartidas` y `asistencia_alumnos`:
  `profesor_id smallint` (reconcilia el tipo si Prompt B lo dejó `integer`) y
  `grupo_materia_id uuid`.
- **Decisión de diseño documentada en el propio SQL**: `profesor_clave` pasa a
  NULLABLE (se conserva la columna y sus UNIQUE existentes) para que las filas
  NUEVAS **dejen de escribir la contraseña** (`profesor_id` es la identidad) y
  para que la UNIQUE legacy no impida 2 materias del mismo profesor/grupo/día.
- FK reales con guardas idempotentes y **reporte de huérfanos** (nunca borra):
  `profesor_id → PROFESORES(ID)`, `grupo_materia_id → grupo_materias(id)`,
  `periodo_id → periodos(id)`, `periodo_evaluacion_id → periodos_evaluacion(id)`
  en ambas tablas + `asistencia_alumnos.curp → ALUMNOS(CURP)`.
- Índices UNIQUE nuevos (arbiters del UPSERT del código):
  `(profesor_id, grupo_materia_id, grado, grupo, fecha)` y
  `(profesor_id, grupo_materia_id, curp, grado, grupo, fecha)`.
  > Nota técnica: son de columnas planas (no expresión `COALESCE`) porque
  > PostgREST/supabase-js solo acepta `onConflict` por lista de columnas y los
  > índices de expresión no son arbiters válidos; las filas nuevas siempre
  > llevan ambos valores NOT NULL, por lo que la idempotencia del UPSERT se
  > mantiene. La neutralización de NULL que pedía el prompt la resuelve, en la
  > práctica, el hecho de que el código NUNCA escribe sin materia resuelta.

### R-2 · `profesor_id` como identidad de escritura y lectura
- `confirmarAsistencias` **rechaza sin `profesorId`** (sesión vieja → volver a
  iniciar sesión) y **nunca escribe con la contraseña**.
- `obtenerEstadosAsistenciaAlumno` acepta `profesorId` y acota por él cuando la
  columna existe; `profesor_clave` solo si es NULL (legacy).
- `actionObtenerEstadosAsistenciaAlumno`, la justificación del profesor y
  `profesorImparteEnGrupo` pasan `sesion.profesorId` en los alcances.
- `actionAnularAsistenciaProfesor` soporta **varias filas por día** (una por
  materia): anula sobre la fila de mayor aporte (resta 1 al total del día).

### R-3 · La subida atribuye la materia (el corazón)
- Núcleo puro nuevo `lib/escolar/atribucion-profesor.ts` (sin I/O): claves de
  conflicto por materia, filas enriquecidas sin `profesor_clave`, asignación
  idempotente `(profesor_id, grupo_materia_id)` activo=true.
- `confirmarAsistencias` (asistencias.ts): resuelve `grupo_materia_id` con
  **consultas fijas** (periodo → grupos → horario → grupo_materias; sin N+1),
  rechaza materia no atribuible, activa la asignación en `asignaciones_profesor`
  y hace el UPSERT por materia (2 materias del mismo grupo y día = 2 filas;
  re-subir la misma = actualizar, no duplicar).

### R-4 · `asignaciones_profesor` reactivada como fuente de alcance
`actionListarAlumnosGruposProfesor`: maestro con asignaciones ACTIVAS ve solo
los grupos de sus asignaciones; sin asignaciones (día 1) o directivo conservan
el comportamiento previo (grupos del operativo con horario).

### R-5 · Panel del directivo en `/configuracion`
Se REACTIVA `AsignacionesProfesorAdmin` (código muerto documentado del Bloque 17)
en `app/configuracion/page.tsx`: qué imparte cada profesor (profesor → materias
activas) con opción de desactivar una asignación equivocada (`activo=false`,
nunca DELETE). Rol directivo validado en las Server Actions existentes.

---

## Validación

- `npx tsc --noEmit` → 0 errores.
- `npm run build` (Next 16) → exit 0.
- `eslint` sobre los archivos tocados → 0 problemas (el lint global conserva
  sus errores/warnings preexistentes).
- Suites puras en verde:
  `test-evaluaciones` 30/30 · `test-fechas` 22/22 ·
  `test-asistencia-parciales` 19/19 · `test-asistencia-contexto` 6/6 ·
  `test-reparar-tabla-legacy` 15/15 · `test-justificacion-por-clase` 13/13 ·
  **`test-atribucion-profesor` 26/26 (nuevo, Prompt C)**.

---

## Mapa de relaciones — antes / después (diagnóstico real)

### Antes (`node scripts/diag-relaciones-supabase.mjs` — 2026-09-04)
- `clases_impartidas` (columnas reales): `id, profesor_clave, grado, grupo,
  carrera, fecha, clases, created_at, updated_at, periodo_id,
  periodo_evaluacion_id` → **0 FK**.
- `asistencia_alumnos` (columnas reales): `id, curp, grado, grupo, carrera,
  nombre, fecha, clases_asistidas, created_at, updated_at, profesor_clave,
  periodo_id, periodo_evaluacion_id` → **0 FK**.
- Resumen global: FK declaradas 13 · relaciones por valor (sin FK) 17.
- `asignaciones_profesor` ya tiene `profesor_id → PROFESORES.ID` y
  `grupo_materia_id → grupo_materias.id`.

### Después (esperado al ejecutar el SQL R-1)
- `clases_impartidas`: FK `profesor_id`, `grupo_materia_id`, `periodo_id`,
  `periodo_evaluacion_id` + UNIQUE por materia.
- `asistencia_alumnos`: FK `profesor_id`, `grupo_materia_id`, `curp`,
  `periodo_id`, `periodo_evaluacion_id` + UNIQUE por materia.
- Las relaciones sueltas de asistencia (curp / profesor_clave) encogen:
  `curp` y `profesor_id` pasan a FK reales; `profesor_clave` queda solo como
  columna legacy.

### Huérfanos medidos ANTES (`node scripts/probe-columnas-asistencia.mjs`)
- `clases_impartidas.periodo_id` → 0 · `.periodo_evaluacion_id` → 0.
- `asistencia_alumnos.periodo_id` → 0 · `.periodo_evaluacion_id` → 0 ·
  `.curp → ALUMNOS` → 0.
- `profesor_id` / `grupo_materia_id` NO existen aún (las crea el SQL con valor
  NULL → 0 huérfanos → las 9 FK podrán crearse sin omisiones).

> El script R-1 reportará con `RAISE NOTICE` cualquier FK que no pueda crear
> por huérfanos en el momento de la ejecución real; con el estado actual no se
> espera ninguna omisión.

---

## Límites respetados

- No se ejecutó SQL; no se hizo backfill de `profesor_id` en las filas
  históricas (autoría irrecuperable con CLAVE compartida). Decisión humana.
- No se corrigieron las `CLAVE` duplicadas de `PROFESORES` (16 comparten la
  misma) ni se tocaron calificaciones/documentos/tutores.
- Con el SQL aún sin aplicar, `confirmarAsistencias` responde el error
  controlado `ERROR_DDL_ATRIBUCION_PENDIENTE` y NO escribe nada con la
  contraseña (comportamiento intencional de seguridad).

---

## Pendiente humano (directivo — en orden)

1. Ejecutar `supabase/agregar-atribucion-profesor-asistencia.sql`.
2. Revisar los `RAISE NOTICE` de FK no creadas por huérfanos (si los hubiera).
3. Decidir la autoría de las 81 filas históricas de `2DO A RH` (documentado en
   O-4/Prompt B).
4. Corregir las `CLAVE` duplicadas de `PROFESORES` para que la co-docencia en
   `asignaciones_profesor` no tope con la UNIQUE legacy `(grupo_materia_id,
   profesor_clave)`.


---

## Errata (2026-09-04) — error de sintaxis 42601 al ejecutar el SQL R-1

El SQL original usaba listas de columnas con tipos en un `FOR … IN` de
PL/pgSQL:

```sql
) AS t(tabla text, col text, ref text, refcol text, nombre text)
```

Esa forma no es válida en ese contexto (error `42601: syntax error at or near
"text"`). Se reescribieron los dos bucles (`v_fk` de FKs y `v_idx` de UNIQUE)
con `SELECT … UNION ALL SELECT …` **sin** declaración de tipos. El resto del
archivo no cambió. Re-ejecutable tal cual.

