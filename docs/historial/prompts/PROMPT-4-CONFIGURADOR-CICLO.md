# PROMPT 4 — Configurador de ciclo: actualizar y deshacer

> Estado: **ejecutado el 2026-09-06** (T1–T5; informe en
> `docs/historial/informes/INFORME-PROMPT-4-CONFIGURADOR-CICLO.md`). Cuarto de
> cinco. Amplía el configurador con lo
> que hoy no se puede hacer: **quitar y actualizar aliases, borrar y actualizar el
> roster, y deshacer datos de un paso**. Empieza cerrando un defecto que puede revertir
> el trabajo del PROMPT-1.

---

## 0. URGENTE — leer antes que el objetivo

**Al reactivar el ciclo operativo, 57 inscripciones se invertirían solas**, deshaciendo
en silencio la deduplicación del PROMPT-1/T3.

Medido el 2026-09-06 contra la base real:

```
CURPs con más de una fila en el ciclo operativo:      92
de esos, la fila MÁS RECIENTE está hoy INACTIVA:      57
```

**Por qué.** `inscripciones_alumno.activo` **no significa «está inscrito»**: significa
«pertenece al ciclo operativo» (lo dice la cabecera de
`lib/escolar/catalogo/inscripciones-borrador.ts`). Y
`sincronizarInscripcionesOperativo()` —que corre en cada activación de ciclo,
`ciclo-estado.ts:503`— reconstruye ese estado eligiendo, para cada CURP,
**la fila más reciente por `created_at`**.

El PROMPT-1/T3 desactivó 55 duplicados usando como verdad **el roster de Excel**. La
activación usa como verdad **la fecha**. Son dos autoridades distintas sobre el mismo
dato, y gana la última que corra.

**Consecuencia práctica:** el técnico entra al configurador, reactiva el ciclo —una
operación normal— y 57 alumnos vuelven al grupo equivocado sin que nada lo reporte.
Ninguna suite lo detecta porque ninguna prueba la interacción entre las dos.

Esto es T1 y **bloquea el resto del prompt**.

---

## 1. OBJETIVO

Que el configurador permita **deshacer y corregir**, no solo crear:

1. Una decisión humana sobre una inscripción **sobrevive a la activación del ciclo**.
2. Los aliases de materia se pueden **quitar y actualizar**, no solo poner.
3. El roster se puede **borrar y actualizar**, no solo cargar.
4. Los datos de un paso del configurador se pueden **deshacer** sin borrar el ciclo entero.

Todo con el patrón del repo: **previsualizar → confirmar**. Ninguna pantalla borra sin
enseñar antes qué va a borrar.

## 2. CONTEXTO — leer solo esto

- `AGENTS.md` · `ESTADO-ACTUAL.md`
- `docs/normativo/REGLAS_NO_HACER.md` — **R5, R6 y R8 aplican en las cuatro tareas**
- `docs/normativo/GLOSARIO.md` — `inscripciones_alumno`, `idInterno` vs `nombreVisible`
- `docs/normativo/ORDEN.md` §3 (`previsualizar` no escribe, `confirmar` sí) y §5 (SQL)
- `docs/sistema/MATRIZ-PERMISOS.md` §4 — **toda capacidad nueva se añade ahí primero**
- `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` — qué hizo T3 exactamente
- `scripts/README.md`

## 3. MEDICIÓN PREVIA

```bash
node scripts/p0-diag-contexto.mjs
node scripts/diag-inscripciones-duplicadas.mjs
node scripts/test-permisos.mjs && node scripts/test-auditoria-permisos.mjs
```

| Medida | Valor al 2026-09-06 |
|---|---|
| Ciclo operativo | `2026-2027` (`7cf5cca7`), único |
| Inscripciones activas | 357 · CURPs con más de una **activa**: 0 |
| CURPs con más de una **fila** | 92 · de ellos invertirían al reactivar: **57** |
| Roles / capacidades / actions | 5 / 62 / 138 |
| Aliases | `materias_nombres_visibles` ya tiene columna `activo` |

---

## 4. TAREAS

### T1 · Que la decisión humana sobreviva a la activación

**Bloqueante. Nada de T2–T4 se toca antes de cerrar esto.**

El problema es de **semántica**, no de código: `activo` carga hoy dos significados
—«pertenece al ciclo operativo» y, desde T3, «esta fila la descartó un humano»— y la
sincronización solo entiende el primero.

Propuesta a validar (**punto de parada**), en orden de preferencia:

- **A — Marcar la decisión, no el estado.** Columna aditiva en `inscripciones_alumno`
  (p. ej. `decision_manual boolean default false` + `motivo text`), y
  `sincronizarInscripcionesOperativo()` **no toca las filas marcadas**. `activo` recupera
  su único significado. Es aditivo, reversible y expresa la regla en el esquema, no en
  un comentario. **Recomendada.**
- **B — Cambiar el criterio de desempate** de `created_at` a algo derivado del roster.
  No resuelve el choque de significados: solo cambia qué autoridad gana.
- **C — Borrar la fila duplicada** en vez de desactivarla. Semánticamente limpio
  —«este alumno nunca estuvo en ese grupo»— pero irreversible, y T3 eligió a propósito
  no borrar.

Con la opción elegida:

1. Aplicarla a las **57 filas en riesgo** identificadas por la medición.
2. **Prueba de regresión obligatoria:** una suite que simule activar el ciclo y
   verifique que ninguna decisión manual se invierte. Hoy no existe, y es justo el
   hueco por el que se colaría el fallo.
3. Documentar en el GLOSARIO qué significa exactamente `activo` y qué significa la
   marca nueva. Dos columnas, dos significados, escritos.

### T2 · Aliases de materia: quitar y actualizar

Hoy solo existe `actionGuardarNombreVisibleMateria` (poner). **La mitad del mecanismo ya
está**: `materias_nombres_visibles` tiene columna `activo`, y
`obtenerNombreVisibleMateria()` ya cae al `idInterno` cuando `activo === false`.

1. Quitar un alias es `activo = false`, **nunca un `DELETE`**: el historial de qué se
   llamó cómo se conserva (R8), y volver a ponerlo es un clic.
2. Actualización en volumen: son 241 materias activas. Una por una no es usable —
   previsualizar los cambios de un archivo y confirmarlos, igual que el roster.
3. Capacidad: **reutilizar `materia.editar_alias`**. Quitar un alias es editarlo; no
   hace falta una capacidad nueva y añadirla solo infla la matriz.
4. Al quitar el alias, la materia vuelve a mostrarse por `idInterno`. **Comprobar que
   ninguna pantalla se rompe**: el `idInterno` es el nombre literal de la tabla física
   (`"2DO A MECATRONICA CONCIENCIA HISTORICA"`), largo y feo, pero válido.

### T3 · Roster: borrar y actualizar

Hoy existe la carga (`actionPrevisualizarSincronizacionAlumnos` +
`actionSincronizarAlumnosDesdeArchivo`). Falta quitar.

1. **Depende de T1.** Sacar a un alumno del roster es exactamente la «decisión humana»
   de T1: si se expresa con `activo=false` a secas, la siguiente activación lo devuelve.
2. Previsualizar siempre: qué alumnos salen, de qué grupo, y **qué se lleva por delante**
   —asistencia, justificaciones y calificaciones existentes de ese alumno en ese ciclo—.
   Contarlo antes, no descubrirlo después.
3. **Sacar del roster no borra al alumno** de `ALUMNOS` ni su historial. Solo deja de
   pertenecer a ese grupo en ese ciclo.
4. Capacidad nueva: **`alumno.borrar_roster`**, separada de `alumno.cargar_roster`.
   Cargar y borrar tienen consecuencias distintas y merecen concederse por separado.
   Fila nueva en §4 → técnico ✅, el resto X.

### T4 · Deshacer los datos de un paso

Hoy o se crea el ciclo o se borra entero (`eliminar_ciclo`). No hay término medio: si
la carga académica salió mal, no se puede rehacer solo ese paso.

1. Por paso del configurador: contexto académico, calendario, horario, roster,
   evaluaciones. Cada uno con su **previsualización de qué se borra y cuántas filas**.
2. **Bloquear lo que tenga datos derivados.** Borrar el horario cuando ya hay asistencia
   registrada contra esos bloques deja huérfanos: o se avisa y se bloquea, o se explica
   exactamente qué arrastra. Nunca en silencio.
3. **No reimplementar `eliminar_ciclo`.** Esto es borrado por paso; el borrado total ya
   existe y funciona (PROMPT-1/T4).
4. Capacidad nueva: **`ciclo.borrar_datos`**. Fila nueva en §4 → técnico ✅, el resto X.
5. Recordatorio del PROMPT-1: al borrar cosas de un ciclo, el calendario **ya cuelga de
   `periodo_id`**; no volver a la ruta por texto, que se retiró.

### T5 · Las capacidades nuevas, por la vía correcta

`alumno.borrar_roster` y `ciclo.borrar_datos` (y cualquier otra que salga):

1. Fila en **§4 de `MATRIZ-PERMISOS.md` primero**, decidida.
2. Luego `lib/auth/capacidades.ts` y `lib/auth/permisos.ts`.
3. `exigir()` en cada action nueva.
4. `npm run gen:matriz` y que `test-permisos.mjs` confirme código = §4.

El detector `test-auditoria-permisos.mjs` falla si una action nueva no llama a
`exigir()`. Es la red: si el prompt se ejecuta mal, salta ahí.

---

## 5. ALCANCE

**SÍ:** `app/components/ciclo-configurador/**` · `lib/escolar/catalogo/*` ·
`lib/escolar/materia/nombres-visibles.ts` · `lib/escolar/ciclo/ciclo-estado.ts` (solo
`sincronizarInscripcionesOperativo`) · actions nuevas de borrado · un `.sql` aditivo si
T1 elige la opción A · las suites afectadas.

**NO:**

- Sacar los `.from()` de las actions (C1), separar puro/IO (C2), `_borrador/` y actions
  huérfanas (C5), CI (D2), la puerta única del cambio de clave → **prompt 5**
- Reescribir `eliminar_ciclo` ni particionar `asistencia_alumnos`
- Tocar la matriz de permisos más allá de las capacidades nuevas de T5

**NUNCA:** borrar filas de `ALUMNOS`, `PROFESORES` o `supabase/*.sql` · borrar un alias
en vez de desactivarlo · borrar datos sin previsualización confirmada · dejar que la
activación de ciclo pise una decisión humana.

---

## 6. CONTRATO

```
1. Antes de tocar nada: correr la medición de §3 y pegarla, incluidas las 57 filas
   en riesgo de T1.
2. La decisión va en un módulo puro y probable sin base de datos. La action solo
   valida sesión con exigir() y delega.
3. Cambio aditivo. Todo borrado es previsualizar -> confirmar, y lo reversible se
   prefiere a lo irreversible.
4. No crear un camino paralelo: inscripciones_alumno sigue siendo la fuente única
   de alumno->grupo; el borrado por paso no duplica a eliminar_ciclo.
5. Validar: npx tsc --noEmit + npm run test:compilar + las 32 suites + la nueva de
   T1 + next build.
6. Volver a correr la medición del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

**Puntos de parada obligatorios:**

- **T1**, antes de escribir nada: elegir entre las opciones A, B o C.
- **T3 y T4**, antes del primer borrado real: revisar la previsualización.
- Cualquier borrado que arrastre datos derivados no previstos.

## 7. ENTREGABLES

- La corrección de T1 + su suite de regresión de activación
- Aliases y roster con quitar/actualizar en volumen, con previsualización
- Deshacer por paso en el configurador
- `docs/sistema/MATRIZ-PERMISOS.md` §4 con las capacidades nuevas, §5 regenerada
- `docs/normativo/GLOSARIO.md`: qué significa `activo` en `inscripciones_alumno` y qué
  significa la marca de decisión manual
- `ESTADO-ACTUAL.md` y `docs/sistema/MAPA-DEL-SISTEMA.md` §2 si cambia alguna deuda
- Informe en `docs/historial/informes/INFORME-PROMPT-4-CONFIGURADOR-CICLO.md`

## 8. Criterio de terminado

1. **Reactivar el ciclo operativo no invierte ninguna decisión manual**, demostrado con
   la suite nueva y con la medición antes/después. Las 57 en riesgo, en 0.
2. Un alias se quita y la materia vuelve a mostrarse por `idInterno`, sin romper pantallas.
3. Un alumno sale del roster, la previsualización dijo antes qué arrastraba, y sigue
   existiendo en `ALUMNOS`.
4. Los datos de un paso se deshacen sin borrar el ciclo.
5. `test-permisos.mjs` = §4 · `test-auditoria-permisos.mjs` sin fallos · 32+ suites ·
   `next build` 9 rutas.
