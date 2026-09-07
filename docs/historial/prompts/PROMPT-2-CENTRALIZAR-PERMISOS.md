# PROMPT 2 — Centralización de permisos

> Estado: **ejecutado 2026-09-06** (T1–T5; resolución T2 de las 13 capacidades aprobada).
> Segundo de cinco. Cubre los pasos 2 a 5 del plan
> de roles. **No crea el rol técnico ni mueve ninguna capacidad**: eso es el prompt 3.
> Informe: `docs/historial/informes/INFORME-PROMPT-2-CENTRALIZAR-PERMISOS.md`.

---

## 1. OBJETIVO

Que el código **deje de preguntar por el rol**. Hoy lo pregunta 182 veces repartidas en
29 archivos, 19 de ellos en `app/actions/`. Al terminar, esa pregunta se hace en un
único módulo puro y cada Server Action declara **qué capacidad exige**, no qué rol
admite:

```ts
if (sesion.rol !== "directivo") return { ok: false, error: "..." }   // antes, ×182
exigir(sesion, "asignacion.editar")                                   // después
```

Con eso, añadir o quitar un rol pasa a ser **una fila en una tabla** en vez de una
pasada por 29 archivos — que es la razón por la que este prompt va antes del técnico.

## 2. LA REGLA DE ORO

> **Este prompt no puede cambiar ni un solo permiso.**
> Al terminar, exactamente los mismos roles deben poder hacer exactamente las mismas
> cosas que antes de empezar. Es refactor puro.

**El error más probable y más caro:** `docs/sistema/MATRIZ-PERMISOS.md` **§4** contiene
la matriz de **destino**, con el rol técnico ya repartido y con capacidades que
directivo va a perder. **Esa matriz NO se implementa en este prompt.** Si la
implementas ahora, dejas a directivo sin calendario ni tutores antes de que exista el
técnico que debía heredarlos, y el sistema queda sin nadie que pueda hacerlo.

Lo que se implementa aquí es la matriz **de hoy**, deducida de la columna «Guardia hoy»
de la **§5** del mismo documento. La §4 se aplica en el prompt 3, en un cambio atómico
junto con la creación del rol.

## 3. CONTEXTO — leer solo esto

- `AGENTS.md` · `ESTADO-ACTUAL.md`
- **`docs/sistema/MATRIZ-PERMISOS.md` completo** — es el documento central de este prompt
- `docs/normativo/ORDEN.md` §2 (capas) y §3 (nombres de funciones)
- `docs/normativo/REGLAS_NO_HACER.md` — R6 aplica: la matriz es fuente única, no se duplica
- `scripts/README.md` antes de ejecutar nada

## 4. MEDICIÓN PREVIA

```bash
node scripts/gen-matriz-permisos.mjs --check   # debe decir "Al día"
npx tsc --noEmit
npm run test:compilar && node scripts/test-auditoria-ciclo-f0.mjs
```

Línea base al 2026-09-06:

| Medida | Valor |
|---|---|
| Server Actions | **138** |
| Capacidades | **59** |
| Comprobaciones de rol | **182** en 29 archivos (19 en `app/actions/`) |
| Llamadas a `obtenerSesionPortal()` en actions | 124 |
| Actions sin leer sesión ni delegar | 13 (eran 16; las 3 del chat se retiraron con el chat) |

---

## 5. TAREAS

### T1 · Las tres piezas

Nada cableado todavía. Al terminar T1 el repo funciona exactamente igual que antes.

1. **`lib/auth/capacidades.ts`** — la lista cerrada, como `union type`. Que TypeScript
   rechace una capacidad inventada es medio trabajo hecho. Las 59 salen de la §5 del
   documento; no inventes ninguna.
2. **`lib/auth/permisos.ts`** — **módulo puro, sin I/O**: la matriz `rol → capacidades`
   y `puede(rol, capacidad): boolean`. Los valores son los de **hoy** (§2 de este
   prompt). Va con su suite `scripts/test-permisos.mjs`, que además de probar `puede()`
   **compara la matriz del código contra la §5 del documento** y falla si divergen.
3. **`lib/auth/exigir.ts`** — la capa con I/O: lee la cookie firmada con
   `obtenerSesionPortal()`, aplica `puede()`, devuelve la sesión ya validada o el error
   estándar. Una línea por action.

`exigir()` es además el punto donde se lee la identidad: si una action no lo llama, se
detecta con un `grep`. Ese es el objetivo de diseño, no un efecto colateral.

### T2 · Resolver las 13 capacidades con guardias mezcladas

**El núcleo del prompt.** 13 de las 59 capacidades agrupan hoy acciones con guardias
distintas. Asignarles una sola guardia sin pensar **cambia permisos en silencio**, que
es justo lo que la regla de oro prohíbe.

| Capacidad | Guardias distintas que conviven hoy |
|---|---|
| `alumno.ver_perfil` | SIN SESION · accesoAlumno |
| `alumno.editar_etiquetas` | SIN SESION · accesoAlumno · accesoAlumno (delega) |
| `asistencia.ver_alumno` | solo directivo/maestro · solo tutor |
| `calificacion.ver` | SIN SESION · solo alumno · solo directivo |
| `calificacion.subir` | SIN SESION · solo directivo · solo directivo/maestro |
| `ciclo.ver` | sesion (cualquier rol) · solo directivo · solo directivo/maestro |
| `documento.ver` | solo directivo/maestro +esDirectivo+nivelAccesoProfesor · solo maestro +esDirectivo |
| `horario.importar` | solo directivo · solo directivo/maestro |
| `justificacion.solicitar` | sesion (cualquier rol) · solo alumno/tutor · solo alumno/directivo/maestro/tutor |
| `justificacion.ver_propias` | sesion (cualquier rol) · solo tutor |
| `materia.ver_catalogo` | SIN SESION · solo directivo · solo maestro |
| `materia.mapear_columnas` | SIN SESION · solo directivo/maestro |
| `tutor.ver_propio` | solo directivo · solo tutor |

Para **cada una**, elegir una de tres salidas y **dejarla escrita** en el documento:

- **UNIÓN** — las actions son entradas distintas a lo mismo y todos esos roles deben
  poder. Ej.: `tutor.ver_propio` lo usan el directivo (para administrar) y el tutor
  (para verse). Los dos, legítimamente.
- **DIVISIÓN** — son permisos distintos con el mismo nombre. Ej.: `horario.importar`
  mezcla importar (directivo) con descargar la plantilla (directivo/maestro): salen dos
  capacidades.
- **CORRECCIÓN** — una de las guardias es un defecto. Ej.: el `SIN SESION` de
  `calificacion.subir` viene de `calificaciones.ts`, que decide el permiso con un `rol`
  que llega en el `FormData`. Eso no se «unifica»: se arregla (ver T4).

**Regla de desempate obligatoria:** ante la duda, **la guardia más estricta**. Nunca
ampliar en silencio. Y **reportar todos los casos donde la unión habría ampliado**,
aunque hayas elegido dividir: son las decisiones que hay que revisar.

Los `SIN SESION` que **delegan** en una función guardada (verificado: los de
`alumno.*`) no son un agujero, pero dejan la guardia invisible: con `exigir()` al
principio se hacen explícitos. Los que **no** delegan, a T4.

### T3 · Migrar por dominio, un commit cada uno

De menor a mayor riesgo. Cada commit: sustituir los `rol !==` por `exigir()`, correr
`tsc` + suites, y **comparar el alcance de cada action contra la §5**.

```
1 noticias    2 semestres   3 calendario   4 evaluaciones  5 asignaciones-profesor
6 horario     7 materias    8 inscripciones-admin          9 tutores
10 documentos 11 asistencias 12 justificaciones 13 escolar
```

`documentos.ts` (11 actions) conserva su helper local `esDirectivo` **solo** mientras
haga falta; el objetivo es que desaparezca a favor de `puede()`.

**`accesoAlumno` y `nivelAccesoProfesor` NO se tocan.** Son ortogonales: la capacidad
dice *qué* puede hacer un rol; ellos dicen *sobre quién*. Se mantienen tal cual,
después de `exigir()`. Fusionarlos rompería el control de alcance que hoy funciona
(regla 5 del documento).

### T4 · Cerrar el agujero de autorización que queda

Era uno de dos; el del chat se fue con el chat, así que queda **`calificaciones.ts`**:
sus 5 actions leen `const rol = String(formData.get("rol"))` y **deciden el permiso con
ese valor**. El rol viene del cliente: mandar `rol=directivo` pasa el control.

Hoy no es alcanzable porque ninguna UI las importa, pero es el archivo que revive el
sistema de boletas. Dos salidas válidas, y hay que elegir explícitamente:

- **Cablearlas** con `exigir(sesion, "calificacion.subir" | "calificacion.ver" | "calificacion.eliminar")`, leyendo el rol **solo** de la cookie firmada.
- **Moverlas a `app/_borrador/`** con las de `lib/calificaciones/`, si se decide que el sistema de boletas las reescribirá.

Lo que **no** es válido es dejarlas como están. Queda fijado en la regla 2 del
documento: *el rol nunca se lee de `FormData`, parámetros ni del cliente.*

### T5 · Detector de regresión

`scripts/test-auditoria-permisos.mjs`, al estilo de las `test-auditoria-ciclo-f*` que ya
existen. Falla si:

1. Aparece un `rol !==` o `rol ===` fuera de `lib/auth/permisos.ts`.
2. Un `export async function action*` no llama a `exigir()`.
3. Alguna capacidad de `capacidades.ts` no aparece en la §5 del documento, o al revés.
4. Alguien lee el rol de `FormData`, de un parámetro o de cualquier fuente que no sea la sesión.

**Excepciones legítimas**, que el detector debe permitir con una lista explícita y
comentada: las actions de `portada.ver` (`actionAlumnosEstrella`,
`actionObtenerNoticiasInicio`) son públicas por diseño — se sirven antes del login.

Desde este script, el orden se mantiene solo: deja de depender de que alguien se
acuerde.

---

## 6. ALCANCE

**SÍ:** `lib/auth/` (3 módulos nuevos) · los 19 archivos de `app/actions/` con
comprobaciones de rol · `scripts/test-permisos.mjs` y `test-auditoria-permisos.mjs` ·
`docs/sistema/MATRIZ-PERMISOS.md` (§4 anotada con las decisiones de T2, §6 actualizada).

**NO:**

- **Añadir `"tecnico"` a `PortalRole`** ni tocar `rolDesdePermisos()` → prompt 3
- **Aplicar la matriz de destino de la §4** → prompt 3
- UI de asignación profesor→materia, cambio forzado de clave → prompt 3
- Sacar los `.from()` de las actions (C1), separar puro/IO (C2) → prompt 5
- Tocar la UI para ocultar botones por capacidad → prompt 3, con el rol ya existente

**NUNCA:** ampliar un permiso sin reportarlo · leer el rol de algo que no sea la cookie
firmada · fusionar capacidades con `accesoAlumno`/`nivelAccesoProfesor` · duplicar la
matriz en dos sitios (R6: el documento y `permisos.ts` se validan entre sí, no se copian).

---

## 7. CONTRATO

```
1. Antes de tocar nada: correr la medición de §4 y pegarla.
2. La decisión va en un módulo puro y probable sin base de datos: permisos.ts es
   puro, exigir.ts es el que hace I/O. La lógica no vive en app/actions/.
3. Cambio aditivo y de comportamiento NEUTRO: ningún rol gana ni pierde nada.
   La única excepción autorizada es T4, y hay que declararla explícitamente.
4. No crear un camino paralelo a una fuente única existente: la matriz vive en
   MATRIZ-PERMISOS.md y en permisos.ts, y la suite verifica que coinciden.
5. Validar: npx tsc --noEmit + npm run test:compilar + las 30 suites + next build.
6. Volver a correr la medición del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

**Puntos de parada obligatorios:**

- **T2**, antes de escribir código: presentar la resolución propuesta de las 13
  capacidades (unión / división / corrección, con el motivo) y esperar aprobación.
  De aquí sale la forma final de la matriz.
- **T4:** decidir entre cablear `calificaciones.ts` o moverlo a `_borrador/`.
- Cualquier caso en que la migración de un dominio **ampliaría** un permiso.

## 8. ENTREGABLES

- `lib/auth/capacidades.ts` · `permisos.ts` · `exigir.ts`
- `scripts/test-permisos.mjs` y `scripts/test-auditoria-permisos.mjs`, con cabecera y fila en `scripts/README.md`
- `docs/sistema/MATRIZ-PERMISOS.md`: §4 anotada con las decisiones de T2, §6 al día
- `ESTADO-ACTUAL.md`: la centralización pasa de «pendiente» a hecha
- `docs/normativo/ORDEN.md` §2: añadir que toda action empieza por `exigir()`
- Informe en `docs/historial/informes/INFORME-PROMPT-2-CENTRALIZAR-PERMISOS.md`, con
  **la tabla de las 13 capacidades y qué se decidió en cada una** — es lo que el
  prompt 3 necesita leer para repartir con el técnico.

## 9. Criterio de terminado

1. ~~`grep -rE 'rol !== "|rol === "' app lib --include='*.ts*'` devuelve resultados **solo** en `lib/auth/permisos.ts`.~~
   > **Corrección posterior (2026-09-06):** este criterio se contradecía con la §6 de
   > este mismo prompt, que difiere la UI al prompt 3. Redactado así era inalcanzable.
   > El criterio correcto es: **cero literales de rol en `app/actions/`** — cumplido,
   > de 130 a 0. Los que quedan son 6 de UI/página (van al prompt 3) y 4 de `lib/`
   > legítimos: `session.ts` (codifica la sesión), `demo-profiles.ts`,
   > `acceso-alumno.ts` y `columnas-calificaciones.ts` (alcance *sobre quién*,
   > ortogonal a las capacidades por la regla 5 de MATRIZ-PERMISOS).
2. Las 138 actions llaman a `exigir()`, salvo las 2 públicas declaradas.
3. `test-permisos.mjs` y `test-auditoria-permisos.mjs` pasan.
4. Las 30 suites siguen pasando y `next build` da 9 rutas.
5. **Un usuario de cada rol puede hacer exactamente lo mismo que antes.** Si algo cambió y no está en el informe, el prompt está mal ejecutado.
