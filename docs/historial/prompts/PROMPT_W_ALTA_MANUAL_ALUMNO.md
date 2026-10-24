# PROMPT W — Alta manual de alumno en Personas › Alumnos › Inscripciones

Redactado por Claude el 2026-10-24 para que lo implemente Cline. Una sola parte, un
dominio (alumno). Peso según `node scripts/diag-peso-cambio.mjs`: **2/14 → Cline**.

---

## OBJETIVO

El técnico, en **Personas › Alumnos › Inscripciones**, da de alta a UN alumno nuevo desde
un formulario, sin subir CSV/Excel. Al terminar debe ser cierto que, con un solo envío:

1. existe la fila en `ALUMNOS` (CURP, CLAVE, NOMBRE, P_APELLIDO, S_APELLIDO, numero_control);
2. existe su inscripción en `inscripciones_alumno` en el grupo elegido del **ciclo operativo**;
3. si se marcó la casilla, existe su tutor (`tutores` + `tutor_alumnos`) y la pantalla muestra
   **una sola vez** las credenciales iniciales del tutor.

## CONTEXTO (presupuesto acotado — no leer nada más)

Generado con `node scripts/gen-contexto.mjs --tarea=crear lib/escolar/alumno app/actions app/components app/components/oceano/contenido-tecnico-oceano.tsx`:

- **Cualquier cambio** → `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` · `docs/normativo/GLOSARIO.md`
- **Crear archivo/función/script** → + `docs/normativo/ORDEN.md`
- **Server Action nueva** → + `docs/sistema/MATRIZ-PERMISOS.md` (§3 y la entrada de §5)

Ninguna suite cubre hoy estos archivos. Términos del glosario que aparecen: `periodos.id`,
`periodos.nombre`, `«ciclo operativo»`.

## ESTADO ACTUAL (verificado por Claude el 2026-10-24 — no re-investigar)

**Navegación.** `lib/navegacion/mapa-navegacion.ts:286-292` declara los modos de
Personas › Alumnos: Roster · Baja y restauración · Etiquetas · Estatus · Inscripciones. Solo
el rol `tecnico` ve la pestaña PERSONAS (`mapa-navegacion.ts:416`). En
`app/components/oceano/contenido-tecnico-oceano.tsx:118-130`, el caso `"roster-alumnos"`
solo distingue `baja…` y `etiquetas…`; **«Inscripciones» (y «Estatus») caen al
`RosterAlumnosPanel`**, que es la carga por archivo. No hay hoy ningún formulario de alta.

**Las tres escrituras YA existen en `lib/` — se reutilizan, no se reescriben:**

| Paso | Función existente | Notas |
|---|---|---|
| Alumno | inserción en `TABLA_ALUMNOS` como en `lib/escolar/alumno/alumnos.ts:365-374` | `CLAVE = claveDesdeCurp(curp)` (`alumnos.ts:26`, últimos 6 de la CURP). CURP válida = `/^[A-Z0-9]{18}$/` (`alumnos.ts:347`). |
| Nº de control | `validarNumeroControl` en `lib/escolar/alumno/numero-control-puro.ts` | Misma regla que el CHECK `alumnos_numero_control_formato`. La columna `ALUMNOS.numero_control` existe y es UNIQUE (error `23505`, ver `numero-control.ts`). |
| Inscripción | `inscribirAlumnoEnCiclo(supabase, { curp, grupoId, periodoId })` — `lib/escolar/catalogo/inscripciones-borrador.ts:252` | Valida alumno existente, grupo real y activo, grupo↔periodo (referencia cruzada), periodo preparable; en OPERATIVO deja una sola fila activa. |
| Grupos | `listarGruposPeriodoAdmin(supabase, periodoId)` — `inscripciones-borrador.ts:38` | Devuelve `{ id, grado, grupo, carreraId, carreraClave, activo }`. |
| Ciclo | `obtenerCicloOperativoGlobal(supabase)` — `lib/escolar/ciclo/ciclo-estado.ts:159` | Fuente única del ciclo operativo. |
| Tutor | `crearTutorConAlumnos(supabase, { curpsAlumnos: [curp], alumnoReferenciaParaUsuario: { curp, nombreCompleto } })` — `lib/escolar/tutores/tutores-relacion.ts:355` | Es exactamente lo que hace «Generar automáticos» por alumno (`tutores-generacion.ts:104-130`). Devuelve `credencialesIniciales { clave_tutor, usuario, contraseñaInicial }`. |
| Nombre | `nombreCompletoAlumno(row)` — `alumnos.ts:14` | |

**Permisos (`lib/auth/permisos.ts:53-104`).** Solo `tecnico` tiene a la vez
`alumno.cargar_roster`, `inscripcion.editar` y `tutor.crear`. `alumno.editar_numero_control`
es SOLO de `administracion` (corregir el número después del alta).

**Datos reales (REST, solo lectura, 2026-10-24):**

- `ALUMNOS`: 472 filas; columnas `CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE, numero_control`.
  Los 472 nombres están en MAYÚSCULAS (48 conservan acentos); las 472 CURP tienen 18
  caracteres; en las 472 `CLAVE` = últimos 6 de la CURP. 1 alumno tiene `numero_control`.
- `periodos`: uno solo, `2026-2027`, `estado = operativo`.
- `grupos`: 24. **2º a 6º repiten letra entre carreras** (hay dos «2DO A», dos «2DO B»…): el
  selector DEBE mostrar la carrera o el técnico no puede distinguirlos.
- `inscripciones_alumno` activas: 357 · `tutor_alumnos` activas: 458.

**Límite de tamaño.** `app/actions/escolar.ts` tiene **998 líneas** y la regla C9 de
`test-orden.mjs` corta en 1000: la action nueva NO cabe ahí.

## DECISIONES TOMADAS (no las reabras)

1. **Capacidad.** La action se autoriza con `exigir("alumno.cargar_roster")` — dar de alta
   un alumno es lo mismo que hace el roster, uno a uno. Si se marcó el tutor, además
   `puede(g.sesion.rol, "tutor.crear")`; si no lo tiene, error y **no se escribe nada**.
   **No se toca `lib/auth/`** ni se crea capacidad nueva. Capturar el número de control
   EN EL ALTA va dentro de `alumno.cargar_roster`; corregirlo después sigue siendo de
   Administración escolar (`alumno.editar_numero_control`, sin cambios).
2. **Solo alumnos NUEVOS.** Si la CURP ya existe en `ALUMNOS` → error con el nombre del
   alumno existente y «para cambiarlo de grupo usa el Configurador de ciclo › Alumnos». No
   se completa ni se sobrescribe nada (eso es la sincronización por archivo).
3. **Campos.** CURP (obligatoria, 18 alfanuméricos, mayúsculas) · Nº de control
   (**obligatorio**, lo pidió el responsable; regla de `validarNumeroControl`, y vacío es
   error, no `null`) · Nombre(s) (obligatorio) · Apellido paterno (obligatorio) · Apellido
   materno (**opcional**: hay personas con un solo apellido) · Grupo (obligatorio, un
   `grupos.id` del ciclo operativo) · Casilla «Crear perfil de tutor» (**desmarcada** por
   defecto). Nombres: `trim`, espacios internos colapsados, `toUpperCase()` conservando
   acentos y Ñ (así están los 472 actuales).
4. **Grado y grupo = UN selector de `grupos.id`**, etiqueta `«{grado} {grupo} · {carreraClave}»`
   (sin carrera: solo `«{grado} {grupo}»`), solo grupos `activo = true` del ciclo operativo,
   ordenados por grado y luego grupo. El cliente envía `grupoId`; **el servidor resuelve el
   periodo** con `obtenerCicloOperativoGlobal` y se lo pasa a `inscribirAlumnoEnCiclo` como
   `periodoId` (referencia cruzada). El cliente nunca manda `periodoId`.
5. **Orden y fallos.** Primero TODAS las comprobaciones sin escribir: formato (módulo puro),
   CURP no existe, `numero_control` no lo tiene otro alumno, hay ciclo operativo, el grupo es
   de ese ciclo y está activo. Después: insertar alumno → inscribir → (tutor). Si falla un paso
   posterior al alta, **no se borra nada**: se devuelve éxito parcial que dice qué quedó hecho
   y qué falta y dónde completarlo (inscripción: Configurador › Alumnos; tutor: Personas ›
   Tutores › Crear). Un `23505` en la inserción se traduce a castellano (CURP o nº de control
   repetido, según cuál choque en la comprobación previa / el mensaje).
6. **Pantalla.** En `contenido-tecnico-oceano.tsx`, el modo que empieza por `inscripciones`
   monta el panel nuevo. Debajo del formulario, una línea: «La carga masiva por archivo (CSV
   o Excel) está en Roster.» Roster sigue montando `RosterAlumnosPanel` sin cambios; Estatus
   no se toca.
7. **Resultado en pantalla.** Tras un alta correcta: nombre completo, CURP, grupo, y «el
   alumno entra con la contraseña inicial de siempre (últimos 6 de su CURP)». Si se creó tutor:
   `clave_tutor`, `usuario`, `contraseñaInicial` con el aviso «se muestran una sola vez»,
   igual que en Tutores › Crear. El formulario se limpia para el siguiente alumno, pero el
   bloque de credenciales se queda visible hasta que el técnico lo cierre o haga otra alta.

## ARCHIVOS

| Archivo | Qué |
|---|---|
| `lib/escolar/alumno/alta-manual-alumno-puro.ts` (nuevo) | **Puro, solo tipos.** `normalizarNombreAlumno(s)`, `validarAltaManualAlumno(entrada)` → `{ ok: true, datos }` o `{ ok: false, error }` con mensajes en castellano para quien captura (reusa `validarNumeroControl` y el regex de CURP; si importas `numero-control-puro.ts` es puro, se permite). `etiquetaGrupoAlta(g)` y `ordenarGruposAlta(gs)`. |
| `lib/escolar/alumno/alta-manual-alumno.ts` (nuevo) | I/O. `obtenerContextoAltaManual(supabase)` → `{ ok, periodo: { id, nombre }, grupos: { id, etiqueta }[] }` con las funciones existentes. `darDeAltaAlumnoManual(supabase, datos, { crearTutor })` según la decisión 5. Imports relativos, nunca `@/`. |
| `lib/validacion/esquemas-puro.ts` | `esquemaAltaManualAlumno` (forma de la entrada; el contenido lo decide el módulo puro, como hace `esquemaNumeroControl`). |
| `app/actions/alta-alumno.ts` (nuevo) | `"use server"`. `actionContextoAltaManual()` y `actionDarDeAltaAlumnoManual(entrada)`: exigir → `leerEntrada` → delegar. Sin `.from()`, sin `if` de negocio, sin `export type {…}` ni reexportaciones (C14). |
| `app/components/alta-alumno-panel.tsx` (nuevo) | `"use client"`. Formulario + resultado. Tokens `var(--oc-*)` y el estilo de `roster-alumnos-panel.tsx` / `tutores-panel.tsx`. Tipos con `import type` desde `lib/`. |
| `app/components/oceano/contenido-tecnico-oceano.tsx` | Rama `inscripciones` (decisión 6). |
| `scripts/test-alta-manual-alumno.mjs` (nuevo) | Suite del módulo puro (la descubre `correr-todas-las-suites.mjs`). |
| `scripts/diag-alta-manual-alumno.mjs` (nuevo) | Diagnóstico **LEE** (solo GET): cuenta alumnos, alumnos con `numero_control`, inscripciones activas, relaciones tutor activas, grupos activos del ciclo operativo. Fila en `scripts/README.md` con columna `LEE(red)`. No imprime CURP, claves ni nombres. |
| `docs/sistema/MATRIZ-PERMISOS.md` | Regenerar con `npm run gen:matriz` (dos Server Actions nuevas). |
| `ESTADO-ACTUAL.md` | Una línea: el alta manual existe. Respetar el tope de ~150 líneas de `verificar:estado` (compacta otra entrada si hace falta). |

## MEDICIÓN

Antes de tocar nada: `node scripts/diag-alta-manual-alumno.mjs` (créalo primero, es lo
único que se escribe antes de medir) y pega la salida. Debe coincidir con el estado de
arriba (472 · 1 · 357 · 458 · 24). Al terminar, vuelve a correrlo: sin altas de prueba, las
cifras deben ser **idénticas** — el cambio no escribe datos por sí mismo. **No hagas altas
reales de prueba contra la base**: la prueba con sesión la hace el responsable.

## RESULTADO ESPERADO

- Personas › Alumnos › **Inscripciones** muestra el formulario; Roster sigue igual.
- Alta válida sin tutor → 1 fila en `ALUMNOS` + 1 inscripción activa en el grupo elegido.
- Alta válida con tutor → además 1 tutor y 1 relación, credenciales en pantalla una vez.
- CURP existente / nº de control repetido / grupo de otro ciclo o inactivo / sin ciclo
  operativo → mensaje claro y **cero escrituras**.
- La suite nueva cubre como mínimo: CURP con 17 y 19 caracteres, minúsculas que se
  normalizan, nº de control vacío (error), con espacios (se normaliza), con símbolos (error);
  apellido materno vacío aceptado; nombre con acentos/Ñ conservados en mayúsculas; etiqueta
  de grupo con y sin carrera; orden de grupos.

## REGLAS / SEGURIDAD / RENDIMIENTO

- Autorizar → validar → delegar (ORDEN §2, PROMPT-K). La action ≤ ~30 líneas por función.
- El rol sale SOLO de la sesión (`g.sesion.rol`), nunca del formulario.
- La contraseña del tutor no se guarda en claro ni se registra en `console`; solo viaja en
  la respuesta de esa llamada (como hoy `actionCrearTutor`).
- Comprobar existencia de CURP y de `numero_control` con `.eq(...).maybeSingle()` /
  `limit(1)`, NO trayendo los 472 alumnos.
- La UI deshabilita el botón mientras envía (evita doble alta por doble clic).

## ALCANCE

**Sí:** los archivos de la tabla. **No:** `lib/auth/` (ni matriz ni capacidades) ·
`roster-alumnos-panel.tsx` · `alumnos.ts` (solo se importa) · `inscripciones-borrador.ts`
(solo se importa; su lectura completa de `ALUMNOS` en el paso 1 es deuda conocida, fuera de
alcance) · `tutores-*.ts` (solo se importan) · el modo Estatus · ningún SQL ni migración.

## VALIDACIÓN

```bash
node scripts/test-alta-manual-alumno.mjs
node scripts/test-orden.mjs
npm run gen:matriz
npm run test:ci
node scripts/diag-alta-manual-alumno.mjs
```

## INFORME

En `docs/historial/informes/INFORME-PROMPT-W-ALTA-MANUAL-ALUMNO.md`, con las 7 secciones de
ORDEN §6: qué se hizo · quién lo ejecutó y qué pudo y no pudo hacer · cómo se ejecutó y se
midió (antes → después) · qué normas respetó (CONTRATO §2) · veredicto frente a la filosofía
y la arquitectura · desviaciones y decisiones propias · lo no verificado (como mínimo: el
alta con sesión real de técnico).

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

---

## EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-24)

No lo ejecutó Cline: el usuario pidió «ejecútalo tú y reaudita en los pasos». Lo
implementó Claude en `dc95ddc`. Informe: `docs/historial/informes/INFORME-PROMPT-W-ALTA-MANUAL-ALUMNO.md`.

Correcciones que la ejecución le hizo a este prompt (para el siguiente que se redacte):

1. **CURP: el prompt pedía el formato flojo** (`/^[A-Z0-9]{18}$/`, `alumnos.ts:347`). Se usó
   `pareceCurp` / `CURP_ALUMNO_RE` (`buscar-en-filas.ts`), que ya existía y es estricto. Medido:
   las 472 CURP reales lo cumplen. Para captura a mano el estricto detecta errores de tecleo
   que el flojo deja pasar. Límite conocido: solo admite sexo `H`/`M`.
2. **Previsualizar → confirmar (CONTRATO §2, «Datos»).** El prompt no lo pedía. Se añadió en la
   interfaz: «Revisar» valida con la misma función pura que el servidor y muestra lo que se va a
   guardar; solo «Confirmar alta» escribe. Para un solo registro, la revisión es el preview.
3. **`gen:matriz` avisa «SIN capacidad asignada» en la primera corrida** aunque `exigir()` esté.
   Lee el documento antes de reescribirlo; la segunda corrida sale limpia. No es un fallo del
   cambio. Conviene decirlo en el próximo prompt que añada una Server Action.
4. **Verificación visual sin sesión.** `/oceano` exige iniciar sesión, la base es la de
   producción y no hay perfil demo de técnico. Se montó el panel en una ruta temporal (borrada
   antes del commit). Su build deja `.next/types` citando la ruta y rompe `tsc` hasta que se
   borra ese directorio generado.
5. **El estado medido se mantuvo**: 472 · 1 · 357 · 458 · `2026-2027` · 24, antes y después.
