# PROMPT C PARA CLINE — `profesor_id` como identidad real + atribución de materias al subir asistencias

> Formato `criterios.prompts` §24. Diagnóstico ya hecho contra Supabase real
> (`scripts/diag-relaciones-supabase.mjs`) — **no re-investigar**.

---

## OBJETIVO

Que la identidad del profesor sea `PROFESORES.ID` (no su contraseña), y que el
acto de **subir una plantilla de asistencias** atribuya esa materia a ese
profesor de forma automática, actualizable y soportando **N materias por
profesor**.

---

## ESTADO ACTUAL (verificado 2026-09-04 — NO re-investigar)

### El catálogo académico ya está bien conectado por UUID

```
periodos.id    <-- periodos_evaluacion · grupos · academico_semestres · horario_semanal
grupos.id      <-- grupo_materias · inscripciones_alumno · horario_semanal
materias.id    <-- grupo_materias · horario_semanal
carreras.id    <-- grupos
PROFESORES.ID  <-- asignaciones_profesor.profesor_id      (la FK YA EXISTE)
tutores.id     <-- tutor_alumnos
```

### Las 4 tablas de asistencia no tienen NI UNA clave foránea

```
calendario_escolar          0 FK   (ciclo_escolar: texto libre)
clases_impartidas           0 FK   (profesor_clave texto; grado/grupo/carrera texto)
asistencia_alumnos          0 FK   (curp texto; profesor_clave texto)
justificaciones_asistencia  0 FK   (curp_alumno, solicitante_id texto)
```

`ALUMNOS.CURP` **es PK**, así que todos esos `curp` podrían ser FK reales y no lo
son. `profesor_clave` es la **contraseña** del profesor (ver O-4 del análisis).

### La tabla correcta ya existe y está vacía

`asignaciones_profesor` es **exactamente** el modelo pedido:

```
id                uuid      PK
profesor_id       smallint  FK -> PROFESORES.ID
grupo_materia_id  uuid      FK -> grupo_materias.id
activo            boolean
desde / hasta     timestamptz
profesor_clave    text      (legacy)
```

Es N:M: «2 materias o más por profesor» **no requiere ningún cambio de esquema**.
Solo está vacía (4 filas, 0 activas). Falta el mecanismo que la puebla.

### EL BLOQUEADOR: `clases_impartidas` no guarda la materia

Columnas reales: `profesor_clave, grado, grupo, carrera, fecha, clases,
periodo_id, periodo_evaluacion_id`. **No hay materia ni `grupo_materia_id`.**

Y el UPSERT (`lib/escolar/asistencias.ts:1176`) usa:

```ts
onConflict: "profesor_clave,grado,grupo,fecha"
```

**Consecuencia hoy:** si un profesor sube MATEMÁTICAS de `2DO A` del día X y
luego HISTORIA del mismo grupo y día, **el segundo UPSERT sobrescribe al
primero**. La plantilla se descarga por materia (`materiaClave`) pero la materia
se pierde al guardar. Es justo el caso «2 materias o más» que hay que soportar.

---

## RESULTADO ESPERADO

### R-1 · Esquema (SQL aditivo, idempotente, NO ejecutar)

`supabase/agregar-atribucion-profesor-asistencia.sql`:

- `clases_impartidas`: `ADD COLUMN IF NOT EXISTS profesor_id smallint`,
  `ADD COLUMN IF NOT EXISTS grupo_materia_id uuid`.
- `asistencia_alumnos`: lo mismo.
- **FK reales** donde no existan: `profesor_id` a `PROFESORES(ID)`,
  `grupo_materia_id` a `grupo_materias(id)`, `periodo_id` a `periodos(id)`,
  `periodo_evaluacion_id` a `periodos_evaluacion(id)`,
  `asistencia_alumnos.curp` a `ALUMNOS(CURP)`.
  Añadir cada FK **solo si no existe** y **solo si no hay filas huérfanas**;
  si las hay, el script las REPORTA y no crea esa FK (nunca borra filas).
- **UNIQUE nueva que incluye la materia**, para que dos materias del mismo grupo
  y día no colisionen. Los NULL de `grupo_materia_id` deben neutralizarse con un
  `COALESCE(grupo_materia_id, <uuid cero>)` dentro de un índice único; sin eso
  Postgres considera los NULL distintos entre sí y se pierde la idempotencia del
  UPSERT.
- **NO** eliminar `profesor_clave` ni las UNIQUE actuales todavía (§14).

### R-2 · `profesor_id` como identidad de escritura y lectura

- Todas las escrituras rellenan `profesor_id = sesion.profesorId`.
- Las lecturas y filtros (`profesorImparteEnGrupo`,
  `actionAnularAsistenciaProfesor`, `obtenerEstadosAsistenciaAlumno`) usan
  `profesor_id` cuando existe y caen a `profesor_clave` solo si es NULL.
- `sesion.matricula` **deja de usarse como identidad** en el módulo de
  asistencias. Si `sesion.profesorId` no está (sesión vieja), la acción debe
  pedir volver a iniciar sesión en vez de escribir con la contraseña.

### R-3 · La subida de asistencias atribuye la materia (el corazón)

Al **confirmar** una plantilla (`confirmarAsistencias`), además de guardar la
asistencia:

1. Resolver `grupo_materia_id` desde el grupo del ciclo operativo + la
   `materiaClave` elegida (el horario ya da la materia; `grupo_materias` ya
   vincula grupo con materia).
2. **UPSERT** en `asignaciones_profesor` de `(profesor_id, grupo_materia_id)`
   con `activo = true` y `desde` = ahora si es nueva.
   Idempotente: volver a subir la misma materia no duplica.
3. Guardar `grupo_materia_id` en las filas de `clases_impartidas` y
   `asistencia_alumnos` de esa subida.

**Actualizable:** si el profesor deja de impartirla, el directivo la desactiva
(`activo=false`, `hasta`=fecha). **Nunca DELETE.** Un profesor con 2+ materias
simplemente tiene 2+ filas activas — el modelo ya lo soporta.

### R-4 · Se reactiva `asignaciones_profesor` como fuente de alcance

Cuando un profesor **ya tenga** asignaciones activas, `actionListarAlumnos-
GruposProfesor` vuelve a acotarse a ellas. Si no tiene ninguna (profesor nuevo),
conserva el comportamiento actual: grupos del ciclo operativo con horario. Así la
atribución mejora sola conforme se usa el sistema, sin bloquear a nadie el día 1.

### R-5 · Panel del directivo

Vista de solo lectura, en `/configuracion`, de qué imparte cada profesor
(profesor y sus materias activas), con opción de desactivar una asignación
equivocada. Reutilizar `reconocimiento-academico.tsx` /
`asignaciones-admin.tsx`, que existen como código muerto documentado (Bloque 17),
en vez de crear un panel nuevo (§8).

---

## REGLAS ARQUITECTÓNICAS

1. **No crear una tabla nueva.** `asignaciones_profesor` ya es el modelo N:M
   correcto (R6: no resolver una carencia creando un módulo paralelo).
2. **Aditivo (§10, §18).** Todo lo existente sigue funcionando con
   `profesor_clave` mientras `profesor_id` sea NULL.
3. **Nada destructivo.** Sin DROP de columnas ni DELETE de filas. Las FK solo se
   crean si no dejan huérfanos; si los hay, se reportan.
4. **La contraseña deja de ser identidad**, pero `profesor_clave` se conserva
   como columna legacy marcada `@deprecated` (§14).
5. **Sin N+1.** La resolución de `grupo_materia_id` es UNA consulta por subida,
   no una por fila de alumno.

---

## PERMISOS / SEGURIDAD

- `profesor_id` sale SIEMPRE de `sesion.profesorId`, nunca del cliente.
- La atribución solo la crea el propio profesor al subir **su** plantilla;
  desactivarla es **solo `directivo`**.
- Se conservan todas las validaciones actuales de rol y de alumno objetivo.
- **No escribir nunca la contraseña en tablas de datos** a partir de este
  trabajo: es el motivo de fondo del cambio.

---

## LÍMITES

- No ejecuta SQL: el `.sql` se prepara idempotente y se documenta.
- No hace backfill de `profesor_id` en las 81 filas históricas (16 profesores
  comparten la clave: la autoría es irrecuperable por código). Decisión humana.
- No corrige las CLAVE duplicadas ni las hashea (tarea del directivo / fase
  propia).
- No toca calificaciones, documentos ni tutores.

---

## VALIDACIÓN

1. `npx tsc --noEmit` · `npm run build` · lint sin errores nuevos.
2. Suites existentes en verde (compilarlas según su cabecera; ver O-5).
3. **Test puro nuevo** `scripts/test-atribucion-profesor.mjs`:
   - un profesor sube 2 materias distintas del MISMO grupo y día → **2 filas de
     `clases_impartidas`**, no una sobrescrita;
   - subir dos veces la misma materia → 1 sola asignación (idempotente);
   - un profesor con 2 materias tiene 2 asignaciones activas;
   - desactivar una deja la otra intacta;
   - sin `profesorId` en sesión → error, y **no** se escribe con `profesor_clave`.
4. `node scripts/diag-relaciones-supabase.mjs` antes/después: las FK nuevas deben
   aparecer y la lista de «relaciones sueltas» debe encoger.

---

## INFORME FINAL (§26)

Incluir el antes/después del mapa de relaciones y la lista exacta de FK que
**no** se pudieron crear por filas huérfanas, con su conteo.

---

## PENDIENTE HUMANO (directivo)

1. Ejecutar `supabase/agregar-atribucion-profesor-asistencia.sql`.
2. Revisar las FK que el script reporte como no creadas por huérfanos.
3. Decidir la autoría de las 81 filas históricas de `2DO A RH` (ver O-4).
