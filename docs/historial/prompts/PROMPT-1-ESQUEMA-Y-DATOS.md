# PROMPT 1 — Esquema y datos del ciclo operativo

> Estado: **redactado, sin ejecutar.** Cubre A1, A3, B1, B3, B4 y la parte de índices
> de B2 del análisis del 2026-09-06. Es el primero de cinco: no toca permisos, ni el
> rol técnico, ni refactor de capas. Esos van en los prompts 2 a 5.

---

## 1. OBJETIVO

Dejar el ciclo operativo `AGO2026-ENE2027` como **única raíz limpia** del sistema:

1. La justificación **por clase** puede guardarse (hoy el código existe y el esquema no lo soporta).
2. El calendario cuelga de `periodo_id`, no de cinco cadenas de texto solapadas.
3. Ningún alumno tiene dos inscripciones activas.
4. Los ciclos `2026-2027` y `BORRADOR` ya no existen, y el operativo no perdió nada.
5. La base rechaza estados imposibles mediante claves foráneas.
6. La asistencia está indexada y con `periodo_id` relleno.

No se pide *cómo*: se pide que al terminar eso sea cierto y esté demostrado con
mediciones antes/después.

## 2. CONTEXTO — leer solo esto

No pegues estos archivos en ningún sitio; ábrelos:

- `AGENTS.md` · `ESTADO-ACTUAL.md`
- `docs/normativo/REGLAS_NO_HACER.md` — **R1, R5, R6, R8 aplican directamente aquí**
- `docs/normativo/GLOSARIO.md` — `periodos.id`, `grupo_materia_id`, `tabla_legacy`, las dos identidades del calendario
- `docs/normativo/ORDEN.md` §1b (familias de `lib/escolar/`) y §5 (orden de SQL)
- `scripts/README.md` — **obligatorio antes de ejecutar nada**
- `docs/sistema/MAPA-DEL-SISTEMA.md` §2 — las tres deudas

## 3. MEDICIÓN PREVIA — obligatoria

Ejecutar y **pegar la salida** en el informe antes de tocar nada:

```bash
node scripts/p0-diag-contexto.mjs
node scripts/diag-calendario-periodo.mjs
node scripts/probe-columnas-asistencia.mjs
node scripts/diag-relaciones-supabase.mjs
```

Línea base medida el 2026-09-06, para comparar:

| Medida | Valor |
|---|---|
| Ciclo operativo | `AGO2026-ENE2027` = `7cf5cca7` |
| Grupos / materias activas / inscripciones activas / bloques de horario | 24 / 241 / 412 / 168 |
| Asignaciones profesor activas | **0** (4 filas en toda la tabla) |
| CURPs con más de una inscripción activa | **55** |
| Buckets de `calendario_escolar` por texto | **5**, ninguno por `periodo_id` |
| `clases_impartidas` | 81 filas, sin `periodo_id`, 1 grupo |
| `asistencia_alumnos` | ≥1000 — **el conteo real está sin medir**, PostgREST corta en 1000 |
| Huérfanos en las 9 FK planeadas de asistencia | **0** |
| `justificaciones_asistencia` | 18 columnas, **sin** `materia_clave` ni `grupo_materia_id` |

Si alguna cifra no coincide con lo que midas, **detente y repórtalo**: el estado
cambió desde el análisis y las decisiones de abajo hay que revisarlas.

---

## 4. TAREAS

Se ejecutan **en orden**. Cada una termina con su validación antes de empezar la siguiente.

### T1 · Justificación por clase (A1)

**Problema:** `lib/escolar/asistencia/justificaciones.ts` implementa la justificación
por clase y `scripts/test-justificacion-por-clase.mjs` pasa 13/13, pero la suite es
pura y no toca la base. En producción no hay dónde guardar la materia.

**Decisión ya tomada — no re-decidir:** la relación es **`grupo_materia_id uuid`**,
no `materia_clave text`. Ya existe y está aplicada en `clases_impartidas` y
`asistencia_alumnos`, con 0 huérfanos. Un identificador de texto más violaría R5.

1. Crear `supabase/agregar-grupo-materia-justificaciones.sql`, aditivo e idempotente:
   - `ADD COLUMN IF NOT EXISTS grupo_materia_id uuid REFERENCES grupo_materias(id) ON DELETE CASCADE`
   - Dos índices únicos **parciales**, porque `NULL` significa «día completo» y en
     Postgres los NULL son distintos entre sí:
     - `(curp_alumno, fecha) WHERE grupo_materia_id IS NULL` — una justificación de día completo
     - `(curp_alumno, fecha, grupo_materia_id) WHERE grupo_materia_id IS NOT NULL` — una por clase
   - Retirar la UNIQUE `(curp_alumno, fecha)` anterior si existe.
2. `supabase/agregar-materia-justificaciones.sql` **no se borra** (R8, y ORDEN.md §5:
   nada se borra de `supabase/`). Añadirle una cabecera que diga que quedó
   **SUPERSEDIDO** por el archivo nuevo y por qué.
3. Adaptar `lib/escolar/asistencia/justificaciones.ts` para resolver por
   `grupo_materia_id`. `calcularClasesJustificadasPorDia` y
   `aplicarAsistenciaJustificada` siguen siendo el núcleo; `aplicarAsistenciaJustificada`
   **mantiene su idempotencia** (fija el total aprobado, no suma).
4. Ampliar `scripts/test-justificacion-por-clase.mjs` con los casos nuevos: justificar
   una clase concreta, justificar el día completo, y que ambas no puedan duplicarse.

**Regla de negocio que debe quedar expresada en la base, no en TypeScript:** o se
justifica el día entero, o clases sueltas, pero nunca dos veces lo mismo.

**Validación:** `npm run test:compilar` + la suite ampliada + `npx tsc --noEmit`.

### T2 · Calendario a `periodo_id` (A3)

**Problema:** hay cinco buckets de texto solapados y ninguno cuelga del ciclo. Mientras
un día pueda existir bajo dos claves, calendario y asistencia pueden discrepar (deuda 1).

Los cinco buckets medidos:

| Bucket textual | Días de clase | Rango |
|---|---|---|
| `2026-2027` | 78 | 2026-08-24 → 2026-12-14 |
| `SEMESTRE AGO26-ENE27` | 73 | 2026-08-31 → 2026-12-15 |
| `PRIMER PARCIAL (SEP-AGO)` | 19 | 2026-08-31 → 2026-09-25 |
| `SEGUNDO PARCIAL (SEP-NOV)` | 29 | 2026-09-28 → 2026-11-06 |
| `TERCER PARCIAL (NOV-DIC)` | 24 | 2026-11-02 → 2026-12-11 |

**Observación que hay que resolver antes de escribir:** el rango del ciclo operativo es
2026-08-31 → 2026-12-11. Los **tres buckets de parcial** cubren exactamente ese rango
(72 días); `SEMESTRE AGO26-ENE27` empieza igual pero termina el 15; `2026-2027`
corresponde al ciclo que se va a borrar. Además el segundo y el tercer parcial se
**solapan** (2026-11-02 → 2026-11-06).

1. Escribir `scripts/diag-calendario-canonico.mjs` (**solo lectura**) que, para cada
   bucket, informe: días por tipo, rango, solapamientos entre buckets, y qué días
   quedarían huérfanos si se elige cada uno como canónico.
2. **DETENERSE Y PREGUNTAR** cuál es el canónico. No elegirlo por tu cuenta: de esa
   elección depende el % de asistencia de todos los alumnos.
3. Con la respuesta, hacer el backfill a `periodo_id` usando
   `planBackfillCalendario()` de `lib/escolar/ciclo/calendario.ts`, que ya existe para
   esto. Dry-run por defecto, escritura solo con `--apply`.
4. Solo después, borrar las filas de `calendario_escolar` que sigan sin `periodo_id`.
5. La ruta legacy por texto (`@deprecated` en `calendario.ts`) **se conserva** (R8).
   Se deja de escribir por ella; no se elimina.

**Validación:** `diag-calendario-periodo.mjs` antes y después; los días del ciclo
operativo pasan de 0 a los del bucket canónico y ninguno queda sin `periodo_id`.

### T3 · Deduplicar inscripciones (B1)

**Problema:** 55 CURPs con más de una inscripción activa, **todas dentro del ciclo
operativo** — los otros dos ciclos tienen 0. Borrarlos no arregla esto.
`inscripciones_alumno` es la fuente única de alumno→grupo (R6): con 55 ambigüedades,
«el grupo del alumno» no tiene respuesta determinista.

**La verdad está fuera del repo:** los Excel de roster en `things/Alumnos CETAC`.

1. `scripts/diag-inscripciones-duplicadas.mjs` (**solo lectura**): lista los 55 CURPs
   con todas sus inscripciones activas, grupo y fecha de alta.
2. `scripts/dedup-inscripciones.mjs` con dry-run por defecto y `--apply`. La ruta a la
   carpeta de Excel es **parámetro obligatorio**, nunca una ruta absoluta incrustada
   (hay precedentes en `scripts/_archivo/` y es una trampa conocida).
3. Cruza cada CURP contra el roster y propone cuál inscripción queda activa y cuál se
   **desactiva**. No borrar filas: `activo=false` es reversible, un `DELETE` no.
4. Todo CURP que no case con el Excel se reporta como **pendiente humano**. No inventar
   el desempate.

**Validación:** `p0-diag-contexto.mjs` debe pasar de 55 a 0 CURPs duplicados, y el
total de inscripciones activas debe bajar exactamente en el número de filas desactivadas.

### T4 · Borrar `2026-2027` y `BORRADOR` (B3)

**Requiere T2 terminado.** La RPC `eliminar_ciclo` borra `calendario_escolar WHERE
periodo_id = ...`, pero los buckets están por texto: si se borra antes del backfill,
quedan filas de calendario que ningún ciclo reclama.

1. Correr `actionDiagnosticoEliminarCiclo` (ya existe) para los dos ciclos y pegar la salida.
2. **Antes de borrar**, capturar del ciclo operativo: grupos, materias activas,
   inscripciones activas, bloques de horario, días de calendario, asignaciones.
3. Borrar con la RPC `eliminar_ciclo`, un ciclo por vez.
4. **Volver a capturar las mismas seis cifras del operativo y demostrar que no
   cambiaron.** Si cambia una sola, revertir y reportar.
5. Con `2026-2027` ya borrado, renombrar `AGO2026-ENE2027` → `2026-2027`. Es seguro:
   el nombre nunca es identificador (R5), solo presentación. Verificar que ninguna
   consulta dependa del nombre viejo antes de hacerlo.

**No tocar** las 81 filas de `clases_impartidas` de autoría irrecuperable. No cuelgan
de ningún ciclo y se conservan como histórico.

### T5 · Claves foráneas (B4)

Las 9 relaciones planeadas tienen **0 huérfanos** medidos. Declararlas convierte en
imposibles estados que hoy la base acepta, y hace fiable la cascada al borrar un ciclo
—que hoy es una PL/pgSQL de 130 líneas que borra a mano, tabla por tabla, y que hay
que acordarse de actualizar cada vez que se añade una tabla que cuelga del ciclo.

1. Re-verificar huérfanos con `probe-columnas-asistencia.mjs`. Si aparece alguno,
   limpiarlo **antes** y reportarlo; no forzar la FK.
2. `supabase/agregar-fk-asistencia.sql`, aditivo: las FK de `clases_impartidas` y
   `asistencia_alumnos` hacia `PROFESORES`, `grupo_materias`, `periodos`,
   `periodos_evaluacion` y `ALUMNOS`.
3. **No reescribir `eliminar_ciclo` en este prompt.** Simplificarla apoyándose en la
   cascada es un cambio aparte, y mezclarlo aquí impide auditar cuál de los dos rompió
   algo si algo rompe.

**Validación:** `diag-relaciones-supabase.mjs` antes y después; las 8 tablas sin FK
bajan, y `eliminar_ciclo` sigue funcionando (probado en T4, que ya pasó).

### T6 · Índices y `periodo_id` en asistencia (B2)

**Decisión ya tomada — no re-decidir:** **no** se crean tablas físicas por materia para
la asistencia. La proyección real es ~345 000 filas por semestre (460 alumnos × ~10
materias × ~75 días), que para Postgres es pequeño. El problema no es volumen, son
índices ausentes y `periodo_id` sin rellenar. Las tablas físicas por materia sí están
justificadas para **calificaciones** —origen Excel, esquema variable, base del sistema
de boletas— pero la asistencia es uniforme y se consulta cruzada (por alumno, grupo,
profesor y parcial): partirla en tablas obligaría a consultar diez y sumar en TypeScript.

1. **Medir el conteo real** de `asistencia_alumnos` y `clases_impartidas` con
   `Prefer: count=exact`. El «1000» de la línea base es el tope de página de PostgREST.
2. Rellenar `periodo_id` y `periodo_evaluacion_id` derivándolos de `fecha` contra
   `periodos` y `periodos_evaluacion`. Aditivo, idempotente, dry-run primero.
3. `supabase/agregar-indices-asistencia.sql`:
   - `(periodo_id, grupo_materia_id, fecha)` — la consulta de grupo por parcial
   - `(curp, periodo_id)` — el histórico del alumno
   - único: `(curp, grupo_materia_id, fecha)` — un registro por alumno, clase y día
4. **No particionar en este prompt.** El particionado por `periodo_id` está aprobado
   como opción, pero se justifica por el borrado instantáneo de un ciclo, no por
   rendimiento. Va en su propio cambio, después de medir con los índices ya puestos.

**Validación:** conteo exacto antes/después, y `diag-calendario-periodo.mjs` +
`probe-columnas-asistencia.mjs` sin huérfanos nuevos.

---

## 5. ALCANCE

**SÍ:** `supabase/*.sql` nuevos · `lib/escolar/asistencia/justificaciones.ts` ·
`lib/escolar/ciclo/calendario.ts` (solo el camino por `periodo_id`) · `scripts/`
nuevos de diagnóstico y migración · las suites afectadas.

**NO — cada uno tiene su propio prompt:**

- Permisos, capacidades, `exigir()`, rol técnico → prompt 2 y 3
- UI de asignación profesor→materia (A2) → prompt 3
- Cambio forzado de clave (A4) → prompt 3
- Ampliar el configurador de ciclo (borrar datos, aliases, roster) → prompt 4
- Sacar los `.from()` de `app/actions/` (C1), separar puro/IO (C2), resolver
  `_borrador/` y las actions huérfanas (C5), CI (D2) → prompt 5
- Reescribir `eliminar_ciclo` para apoyarse en las FK → cambio aparte
- Particionar `asistencia_alumnos` → cambio aparte

**NUNCA en este prompt:** tocar `scripts/_peligrosos/` o `scripts/_archivo/`; eliminar
legacy (R8); crear un identificador de texto nuevo (R5); crear una segunda fuente de
verdad (R6).

---

## 6. CONTRATO (obligatorio)

```
1. Antes de tocar nada: correr los diagnósticos de solo lectura de §3 y pegar la
   medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action solo
   valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración de
   datos sin autorización explícita. Las excepciones autorizadas aquí son T3
   (desactivar, no borrar) y T4 (borrar los dos ciclos), y ambas exigen dry-run
   revisado antes del --apply.
4. No crear un camino paralelo a una fuente única existente (periodos para ciclo,
   inscripciones_alumno para alumno→grupo, grupo_materia_id para materia en ciclo).
5. Validar: npx tsc --noEmit + npm run test:compilar + las suites puras del módulo
   + next build.
6. Volver a correr los diagnósticos del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

**Puntos de parada obligatorios** — no continuar sin respuesta humana:

- **T2 paso 2:** cuál de los cinco buckets de calendario es el canónico.
- **T3:** revisar el dry-run de la deduplicación antes del `--apply`.
- **T4:** confirmar el borrado de los dos ciclos tras leer el diagnóstico.
- Cualquier cifra de §3 que no coincida con la línea base.

## 7. ENTREGABLES

- Los `.sql` nuevos en `supabase/`, con la convención de verbos de ORDEN.md §5.
- Los `scripts/` nuevos, cada uno con cabecera (qué mide, qué escribe, cómo se ejecuta)
  y su fila en `scripts/README.md`.
- `ESTADO-ACTUAL.md` actualizado: §3 deudas, §5 estado de datos, §6 pendientes humanos.
- `docs/sistema/MAPA-DEL-SISTEMA.md` §2 si alguna deuda cambia de estado.
- El informe en `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md`.
