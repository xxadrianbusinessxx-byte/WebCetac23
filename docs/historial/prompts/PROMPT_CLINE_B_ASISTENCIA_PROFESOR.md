# PROMPT B PARA CLINE — "Asistencia de mis alumnos" + identidad del profesor + justificación POR CLASE

> Formato `criterios.prompts` §24. **Ejecutar DESPUÉS del Prompt A.**
> Diagnóstico ya hecho contra Supabase real — **no re-investigar**.
> Reproducible con `node scripts/diag-profesor-alcance.mjs`.

---

## OBJETIVO

Hacer funcional el panel **"Asistencia de mis alumnos"** del profesor (hoy
muerto), permitiéndole buscar un alumno, ver su asistencia y **justificar una
clase concreta** (no el día entero), reutilizando el horario oficial que ya sabe
qué materias tiene el grupo cada día. En el mismo trabajo, dejar de identificar
al profesor por una `CLAVE` que está duplicada.

---

## ESTADO ACTUAL (verificado 2026-09-04 — NO re-investigar)

```
=== PERIODO OPERATIVO: AGO2026-ENE2027 ===

1) asignaciones_profesor      → 4 filas · 0 ACTIVAS
2) horario_semanal            → 168 bloques · 0 con profesor_clave
3) clases_impartidas          → 81 filas · 1 solo profesor: "4321" en 2DO A RH

=== PROFESORES (calidad de CLAVE) ===
  20 filas · claves distintas: 3
  !! CLAVE="4321" compartida por 16 profesores
  !! CLAVE="8080" compartida por 3 profesores

=== justificaciones_asistencia ===
  columnas: id, curp_alumno, fecha, grado, grupo, carrera, motivo, estado,
            solicitante_tipo, solicitante_id, created_at, updated_at,
            archivo_path, archivo_nombre, archivo_mime, archivo_size,
            motivo_rechazo, periodo_id
  ¿columna de materia/bloque/clase? NO → hoy la justificación es POR DÍA
```

### Los tres defectos

1. **El buscador está muerto.** `actionListarAlumnosGruposProfesor`
   (`app/actions/asistencias.ts`, ~línea 905) usa `resolverAsignacionesProfesor`,
   que devuelve `[]` porque `asignaciones_profesor` tiene **0 activas** → error
   *"No tienes grupos asignados en el catálogo"*.

2. **La identidad del profesor es ambigua.** Todo el módulo usa
   `profesor_clave = sesion.matricula = PROFESORES.CLAVE`. Con 16 profesores
   compartiendo `"4321"`: sus asistencias se mezclan en la misma fila,
   `actionAnularAsistenciaProfesor` (scoped por `profesor_clave`) **pisa el
   aporte de los otros 15**, y `profesorImparteEnGrupo` da `true` a los 16 si uno
   solo subió algo. La sesión **ya lleva** `sesion.profesorId` (`PROFESORES.ID`,
   identidad estructural C4.10) — el módulo simplemente no lo usa.

3. **La justificación es por día, no por clase.** `aplicarAsistenciaJustificada`
   (`lib/escolar/justificaciones.ts`, ~192) suma
   `faltante = esperadas - asistidas` bajo el marcador `PROFESOR_JUSTIFICACION`,
   dejando el día como asistencia completa. No hay forma de justificar 1 de 3
   clases.

### DECISIONES YA TOMADAS POR EL DIRECTIVO (no reabrir)

- **Alcance del profesor = el horario del grupo, SIN acotar por profesor.**
  Coherente con la decisión del Bloque 13 (*"cualquier profesor puede descargar
  la plantilla de una materia"*). No se reactiva `asignaciones_profesor` ni se
  puebla `horario_semanal.profesor_clave` en este trabajo.
- **Identidad = `PROFESORES.ID` (`sesion.profesorId`)**, migración ADITIVA.

---

## RESULTADO ESPERADO

### R-1 · El buscador usa el horario, no `asignaciones_profesor`

`actionListarAlumnosGruposProfesor` se reescribe para:
- resolver el **ciclo operativo global** (`obtenerCicloOperativoGlobal`);
- listar los grupos de ese periodo que **tienen horario cargado**
  (reutilizar `obtenerGruposConCarreraDePeriodo` + `horario_semanal`);
- traer los alumnos con `obtenerAlumnosDelGrupo` en `Promise.all` (ya lo hace).

Nunca más el mensaje *"No tienes grupos asignados"*. Si no hay ciclo operativo o
no hay horario, el mensaje debe decir exactamente eso y qué hacer.

> `resolverAsignacionesProfesor` **no se borra**: se marca `@deprecated` para este
> uso, con nota de que volverá a ser la fuente cuando `asignaciones_profesor` se
> pueble (§14, R8).

### R-2 · Buscar alumno y ver su asistencia
El profesor busca por nombre o CURP dentro de esos grupos y, al elegir, se
renderiza el `CalendarioAsistenciaAlumno` ya existente **con el desglose por
parcial** que entregó el trabajo anterior. **No** duplicar el calendario: es el
mismo componente.

### R-3 · Justificación POR CLASE (el corazón del trabajo)

**Origen de las opciones:** las materias que el grupo tiene **ese día** salen del
horario oficial — `consultarHorarioGrupoPorIdentidad` + `diaSemanaDesdeFecha`
(ambas existentes). Si un día tiene `MATEMÁTICAS` (2 bloques) y `HISTORIA`
(1 bloque), el profesor ve esas dos opciones con su número de bloques.

**Esquema (aditivo, SQL preparado NO ejecutado):**
`supabase/agregar-materia-justificaciones.sql`, idempotente:
- `ALTER TABLE justificaciones_asistencia ADD COLUMN IF NOT EXISTS materia_clave text;`
- Sustituir la UNIQUE `(curp_alumno, fecha)` por un índice único sobre
  `(curp_alumno, fecha, COALESCE(materia_clave, ''))`.
  **Importante:** no basta una UNIQUE de 3 columnas — en Postgres los `NULL` son
  distintos entre sí y permitirían duplicar las justificaciones de día completo.
  El `COALESCE` conserva la idempotencia del UPSERT actual.
- `DROP ... IF EXISTS` + `CREATE ...` para poder re-ejecutar.
- `materia_clave IS NULL` = justificación de **día completo** (comportamiento
  actual preservado: compatibilidad aditiva, §10).

**Semántica de aplicación:** `aplicarAsistenciaJustificada` deja de sumar el
faltante entero y pasa a:
1. calcular las clases justificadas **aprobadas** de ese día = suma de bloques de
   cada materia justificada (día completo sigue valiendo el faltante entero);
2. hacer el UPSERT bajo `PROFESOR_JUSTIFICACION` **fijando** ese total, nunca
   sumando 1 cada vez — el `onConflict` reemplaza la fila, así que el valor debe
   ser el total recalculado. Idempotente: reaplicar da el mismo número.
3. nunca superar `esperadas` del día (tope).

**Flujo del profesor:** mismo circuito que ya usa el directivo
(`estado` pendiente/aprobada/rechazada, `motivo_rechazo`, mensajes). El profesor
crea la solicitud con `solicitante_tipo='profesor'` y `materia_clave` elegida.
**Reutilizar** `actionSolicitarJustificacionConArchivo` y las acciones de
aprobación existentes — no crear un segundo circuito de justificaciones (§4, R6).

### R-4 · Identidad del profesor por `profesorId` (aditivo)

`supabase/agregar-profesor-id-asistencia.sql`, idempotente:
- `ADD COLUMN IF NOT EXISTS profesor_id integer` en `clases_impartidas` y en
  `asistencia_alumnos`.
- Índices por `(profesor_id, fecha)` en ambas.
- **NO** se toca `profesor_clave` ni las UNIQUE existentes (los UPSERT actuales
  siguen funcionando exactamente igual).

En el código:
- Toda **escritura** nueva rellena `profesor_id = sesion.profesorId` además de
  `profesor_clave` (compatibilidad).
- `actionAnularAsistenciaProfesor` acota por `profesor_id` **cuando la sesión lo
  tiene**; si no, mantiene el comportamiento actual por `profesor_clave` y deja
  constancia en el resultado de que la operación fue ambigua.
- `profesorImparteEnGrupo` prefiere `profesor_id`.

> **BACKFILL: NO ES POSIBLE y no debe intentarse.** Las 81 filas existentes tienen
> `profesor_clave='4321'`, compartida por 16 profesores: **no hay forma de saber
> a cuál pertenecen**. Se dejan con `profesor_id NULL` y se documentan como
> "profesor no identificable (deuda histórica)". Inventar una atribución sería
> exactamente lo que prohíbe R7/§4. Repórtalo en el informe.

---

## REGLAS ARQUITECTÓNICAS

1. **Fuente única (§4).** Ciclo → `obtenerCicloOperativoGlobal`. Materias del día
   → `horario_semanal`. Alumnos del grupo → `obtenerAlumnosDelGrupo`. Estados de
   asistencia → `obtenerEstadosAsistenciaAlumno`. **No** crear listas paralelas.
2. **Un solo circuito de justificaciones.** Se extiende el existente; no se crea
   uno "del profesor" (R6).
3. **Cambios aditivos (§10, §18).** `materia_clave` y `profesor_id` son opcionales;
   todo el comportamiento actual (justificación de día completo, escrituras por
   `profesor_clave`) sigue funcionando sin cambios.
4. **Nada destructivo.** Ningún `DROP TABLE/COLUMN`, ningún `DELETE`. El único
   `DROP` permitido es el del índice único que se recrea con `COALESCE`.
5. **La UI no es autorización (§15, §7).** El profesor ve el selector de materia
   porque el horario lo dice, pero el servidor revalida que esa `materia_clave`
   pertenece al horario de ese grupo **en esa fecha** antes de escribir.

---

## PERMISOS / SEGURIDAD (server-side)

- Justificar: `maestro` | `directivo` | `tutor` | `alumno`, con las validaciones
  ya existentes (tutor solo sus CURPs, alumno solo la propia). **Reutilizarlas.**
- El profesor, además: la `materia_clave` debe existir en el horario del grupo
  del alumno para el día de la semana de esa fecha. Materia que no está ese día →
  error, sin escritura.
- Aprobar / rechazar: **solo `directivo`** (sin cambios).
- `profesor_id` sale SIEMPRE de `sesion.profesorId`, nunca del cliente.
- Se conservan las validaciones de fecha no futura y de falta realmente
  registrada.

---

## RENDIMIENTO

- El horario del grupo se consulta **una vez** por alumno seleccionado y se
  reutiliza para todos los días del calendario. **Prohibido** consultarlo por día.
- La lista de grupos + alumnos sigue en `Promise.all` por grupo (ya lo está).
- El recálculo de clases justificadas del día usa las justificaciones ya
  cargadas del alumno (`actionObtenerJustificacionesDeAlumno`), sin consulta
  adicional por día. Cero N+1.

---

## LÍMITES

- ❌ No puebla `horario_semanal.profesor_clave` ni reactiva `asignaciones_profesor`.
- ❌ No corrige las `CLAVE` duplicadas en `PROFESORES` (es tarea del directivo).
- ❌ No hace backfill de `profesor_id` (imposible, ver R-4).
- ❌ No ejecuta SQL: los dos `.sql` se preparan idempotentes en `supabase/` y se
   documentan para ejecución manual (§14).
- ❌ No toca calificaciones, documentos, tutores ni autenticación.

---

## VALIDACIÓN

1. `npx tsc --noEmit` → 0 errores.
2. `npm run lint` → sin errores nuevos.
3. `npm run build` → compila.
4. Tests existentes que deben seguir pasando: `test-evaluaciones`, `test-fechas`,
   `test-asistencia-parciales`, `test-asistencia-contexto`.
5. **Test puro nuevo** `scripts/test-justificacion-por-clase.mjs` (sin Supabase):
   - día con 3 bloques (2 de MATEMÁTICAS + 1 de HISTORIA): justificar HISTORIA
     aplica **1** clase, no 3;
   - justificar MATEMÁTICAS aplica **2**;
   - justificar ambas → 3, **nunca más que las esperadas**;
   - reaplicar la misma justificación → mismo total (idempotente, no acumula);
   - `materia_clave = null` (día completo) mantiene el comportamiento actual;
   - materia que NO está en el horario de ese día → rechazada;
   - una justificación rechazada no suma clases.
6. `node scripts/diag-profesor-alcance.mjs` antes/después, con la salida pegada
   en el informe.

---

## INFORME FINAL (§26)

Con secciones extra obligatorias:
- **Identidad:** qué escrituras ya llevan `profesor_id`, y confirmación explícita
  de que NO se inventó backfill para las 81 filas históricas.
- **Pendiente:** los dos `.sql` a ejecutar por el directivo, en orden.

---

## PENDIENTE HUMANO (directivo)

1. Ejecutar `supabase/agregar-profesor-id-asistencia.sql` y
   `supabase/agregar-materia-justificaciones.sql` en el SQL Editor.
2. **Corregir las `CLAVE` duplicadas de `PROFESORES`** (16 comparten `4321`).
   Mientras no se haga, dos profesores distintos pueden seguir pisándose en los
   registros anteriores a esta migración. Existe ya el flag
   `debe_cambiar_credenciales` para forzarles el cambio.
3. Decidir si en algún momento se poblará `horario_semanal.profesor_clave`, que
   es lo que permitiría acotar de verdad "mis alumnos".
