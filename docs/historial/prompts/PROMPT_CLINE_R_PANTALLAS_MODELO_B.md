# PROMPT CLINE — R · Las pantallas del modelo B, y dos guardianes que faltaban

> Medido el **2026-10-01** sobre `main` (`53a1972`). Las cifras no se
> re-investigan; si alguna no coincide con lo que veas, **dilo antes de seguir**.
>
> Peso según `diag-peso-cambio.mjs`:
>
> | Parte | Qué | Peso | Va a |
> |---|---|---|---|
> | 0 | dos reglas nuevas en `test-orden` | 1/14 (GOBIERNO) | **Cline + revisión** |
> | 1 | la vista de calificaciones del alumno | 2/14 | Cline |
> | 2 | la subida del profesor escribe también en el modelo nuevo | 1/14 | Cline |
> | 3 | la pantalla del técnico: materias por grupo | 3/14 | Cline |
>
> **Cuatro partes con parada obligatoria entre cada una.** No las encadenes.

---

## Lo que NO es tuyo, y por qué

La regla de `diag-peso-cambio` dice que si algo no va a Cline la razón va
escrita. Esto ya está hecho y **no se toca**:

- **Todo el servidor del modelo B**: `app/actions/calificaciones-normalizadas.ts`,
  `lib/escolar/materia/calificaciones.ts`, `calificaciones-puro.ts`,
  `puente-grupo-materia.ts`, y lo añadido a `mapeo-columnas-materia.ts`,
  `nombres-visibles.ts` y `excel-a-registros.ts`. Ahí vive el **alcance por
  CURP** (quién ve las notas de quién) y el **cerrojo del padrón** (no se
  escriben notas a alumnos de otro grupo). Un error en esas líneas no rompe
  nada visible: deja leer o escribir notas ajenas. Por eso lo hice yo.
- **El SQL.** `supabase/corregir-unicidad-calificaciones.sql` lo aplica una
  persona en el SQL Editor (está en `pendientes.json`, riesgo alto). **Hasta
  que se aplique, toda escritura del modelo B devuelve `42P10`**: tus pantallas
  lo mostrarán como error, y es correcto que lo hagan. No lo esquives.

**Si te falta algo del servidor** —una action, un campo, un tipo—: **para y
dilo**. No lo añadas tú, ni en la action ni en `lib/`.

**Prohibido ejecutar**: cualquier `.sql`, cualquier `migrar-*` (incluido
`migrar-ensayo-modelo-b.mjs`, que con `--apply` escribe en producción) y nada
de `scripts/_peligrosos/`. No hay staging: lo que se toca, se toca en real.

---

## ANTES DE NADA

```bash
node scripts/gen-contexto.mjs --tarea=crear \
  app/components/oceano/contenido-alumno-oceano.tsx \
  app/components/materia-mapeo-columnas.tsx \
  app/components/oceano/contenido-tecnico-oceano.tsx \
  app/actions/calificaciones-normalizadas.ts \
  app/components \
  lib/navegacion/mapa-navegacion.ts \
  scripts/test-orden.mjs package.json .github/workflows/verificacion.yml
```

Lee solo lo que salga. De `app/actions/calificaciones-normalizadas.ts` lee
**las firmas y los comentarios** de las actions que se citan abajo: son tu
contrato con el servidor.

---

# PARTE 0 · Dos guardianes en `test-orden` (Cline + revisión)

Las dos existen porque el fallo **ya pasó**, y las dos veces en verde.

## C16 · cada `onConflict` es una restricción que la base sabe usar

**Lo que pasó.** Las escrituras del modelo B apuntaban con `onConflict` a un
índice único **parcial** (`where … is not null`) y a uno de **expresión**
(`coalesce(clave_columna, '')`). PostgreSQL no infiere ninguno de los dos desde
el `ON CONFLICT (cols)` que genera PostgREST: cada escritura devolvía `42P10`
y no escribía nada. Las suites estaban en verde, porque su doble de Supabase
acepta cualquier `onConflict`.

**La regla.** Todo `onConflict: "a,b"` **literal** en `lib/**/*.ts` tiene que
coincidir (mismas columnas, en cualquier orden) con una de estas, declarada en
`supabase/*.sql` sin contar comentarios `--`:

- una restricción `unique (a, b)` —que no sea parte de un `create unique index`—;
- un `create unique index … (a, b)` **sin** `where` y **sin** expresiones (ningún
  `(` dentro de la lista de columnas);
- una columna `primary key`.

La lógica ya está escrita y probada en el último bloque de
`scripts/test-calificaciones-io.mjs` («cada onConflict del modelo B existe como
restricción en la base»), incluida la contraprueba que demuestra que rechaza
un índice parcial y uno de expresión. **Llévala a `test-orden.mjs`
generalizada a todo `lib/`**; no la reescribas de cero.

**Línea base medida: 23 claves literales, 0 sin declarar.** Umbral **0, duro**.

**Las dos claves NO literales** (`lib/escolar/asistencia/asistencia-plantillas.ts`,
`atribuido.conflictoClases` y `atribuido.conflictoAsistencia`) salen de
constantes de `atribucion-profesor.ts` y sus índices se crean con SQL dinámico
(`agregar-atribucion-profesor-asistencia.sql`, `CREATE UNIQUE INDEX %I ON … (%s)`):
índices simples, inferibles, y asistencias funciona en producción con ellos.
Van en una **lista de excepciones con su motivo escrito al lado**, como hace
`test-auditoria-permisos` con las suyas. Una tercera clave no literal **no**
entra sola en la lista: falla.

## C17 · `npm run test:ci` reproduce el workflow

**Lo que pasó.** `test:ci` corre suites, `gen-invariantes`, `gen-rumbo`,
`verificar:estado` y `verificar:docs`. El workflow
(`.github/workflows/verificacion.yml`) corre **además** tsc, lint,
`test:permisos`, `gen-matriz-permisos --check` y build. Son dos listas de lo
mismo y ya divergieron (R6): con `test:ci` en verde, `gen-matriz` estuvo
desfasado dos commits seguidos.

**El cambio.**
1. `test:ci` en `package.json` corre **los mismos pasos que el workflow**, en
   el mismo orden, salvo `npm ci`.
2. C17 lee los `run:` del workflow y el `test:ci` de `package.json`, y falla si
   un paso del workflow (salvo `npm ci`) no está en `test:ci`. Compara por
   comando normalizado: `npm run x` y el script al que `x` apunta cuentan como
   el mismo.

Umbral **0, duro**. Las dos reglas: fila en el encabezado de `test-orden.mjs`
como las demás, con el porqué.

**Cierre de la Parte 0:** `node scripts/test-orden.mjs` → 17 reglas en verde, y
`npm run test:ci` en verde. **Para.** Esta parte la reviso antes de que sigas.

---

# PARTE 1 · La vista de calificaciones del alumno

## Dónde

`app/components/oceano/contenido-alumno-oceano.tsx`, la pieza
`pieza === "materias-calificacion"`. Esa pieza la montan **tres** pantallas:
la del alumno, la del tutor (con su vinculado) y la de Administración escolar
(consultando un expediente). En las tres, `datos.curp` es la CURP **del alumno
que se está mostrando**.

## Qué cambia

Hoy la pieza lista `datos.materias` (tablas físicas por grado y grupo) y lee
cada una con `actionObtenerVistaMateria`. **240 de las 241 tablas físicas están
vacías**: el alumno no ve nada. Pasa a leer del modelo nuevo:

```ts
import { actionVistaCalificacionesAlumno } from "@/app/actions/calificaciones-normalizadas";

// la carga del alumno, sin notas:
actionVistaCalificacionesAlumno(datos.curp)
// la carga y las notas de UNA materia:
actionVistaCalificacionesAlumno(datos.curp, grupoMateriaId)
```

Devuelve `VistaCalificacionesAlumno | null`:
`{ curp, materias: MateriaDelAlumno[], actividades: {clave, valor}[],
parciales: {clave, valor}[], promedio, final, promedioActividades }`, y
`MateriaDelAlumno = { grupoMateriaId, materiaId, nombre, nombreVisible, grado,
grupo, activo }`. Los tipos se importan con **`import type`**.

**Pasa siempre `datos.curp`.** El servidor decide si esa sesión puede ver a ese
alumno; tú no preguntas por el rol (no hay `rol ===` en un componente).

## Reglas de presentación

- Nombre de la materia: `nombreVisible ?? nombre`.
- Una nota `null` se pinta **«—»**, nunca `0`: `0` es «sacó cero», `null` es «no
  hay nota». Confundirlas es el fallo que el modelo nuevo vino a quitar.
- `promedio` (lo que subió el profesor) y `promedioActividades` (calculado con
  los pesos) se muestran **los dos** cuando existen, con su etiqueta. Si
  difieren, el que vale es el del profesor; no ocultes el calculado.
- Sin materias: el mismo `Aviso` que hoy. Materia sin notas: «Tu profesor aún
  no ha subido calificaciones de esta materia.»
- `null` de la action (sin permiso, sin sesión): el mismo aviso de vacío, sin
  detalles técnicos.

## Lo que NO haces

- **No uses `MateriaSelector`** para esta lista. Su contrato dice que
  `seleccionada` y `onSeleccionar` trabajan **siempre con `idInterno`** (el
  nombre de la tabla física); meterle un `grupoMateriaId` sería dar a un campo
  dos significados (R5). Una lista sencilla propia; si ya existe una pieza en
  `app/components/ui/` que sirva, úsala (C11).
- **No borres** `MateriaCalificacionesAlumno` ni `actionObtenerVistaMateria`:
  `actionObtenerVistaMateria` la siguen usando `contenido-docente-oceano.tsx` y
  `materia-mapeo-columnas.tsx`. Si al terminar `MateriaCalificacionesAlumno`
  queda sin nadie que la importe, **dilo en el informe y déjala**: retirar
  legacy es un cambio aparte y lo decido yo (R8).
- No calcules promedios en el componente: vienen calculados.

**Cierre de la Parte 1:** CI completo en verde (ver «Cierre» al final).
**Para.**

---

# PARTE 2 · La subida del profesor escribe también en el modelo nuevo

## Dónde

`app/components/materia-mapeo-columnas.tsx`, en las **dos** subidas:
`actionActualizarMateriaExcel` (~línea 303) y `actionSubirMateriaExcel`
(~línea 318).

## Qué cambia

Después de que la subida vieja vuelva `ok`, con el **mismo** `FormData`:

```ts
import {
  actionResolverGrupoMateria,
  actionSubirCalificacionesArchivo,
} from "@/app/actions/calificaciones-normalizadas";

const pareja = await actionResolverGrupoMateria(idInterno);   // { grupoMateriaId } | null
if (pareja) {
  const r = await actionSubirCalificacionesArchivo(pareja.grupoMateriaId, formData);
  // r: { ok: true; escritas: number; avisos: string[] } | { ok: false; error: string }
}
```

## Cómo se muestra

Un **segundo** resultado, debajo del de la subida vieja, que **no lo cambia**:

- `ok`: «Modelo nuevo: N calificaciones guardadas.» y, si hay `avisos`, la
  lista (hasta 10 visibles y «y N más»). Los avisos **siempre** se muestran: son
  filas omitidas y CURP de otro grupo, y un «listo» a secas dejaría al profesor
  creyendo que subió lo que no subió.
- `ok: false`: el `error` **tal cual** viene, con estilo de aviso, no de fallo
  de la subida. Hoy, sin el SQL aplicado, saldrá el `42P10`; los mapeos sin
  columna de CURP dan un error que ya explica qué hacer. No los traduzcas.
- `pareja === null`: «Esta materia no está en el catálogo de grupos: sus notas
  solo se guardaron en la tabla de la materia.»

Si la subida vieja falla, **no** llames a la nueva.

## Un aviso más, en la configuración de columnas

**Los 2 mapeos que existen tienen la columna de CURP vacía**, y sin ella el
modelo nuevo no puede atribuir una nota a ningún alumno. En la misma pantalla,
junto al selector de CURP que ya existe (~línea 429), si `mapeo.columnaCurp`
está vacío: «Sin columna de CURP, estas calificaciones no llegan a la vista
del alumno.» Solo el aviso: no hagas obligatorio el campo.

## Lo que NO haces

- No toques la subida vieja ni su mensaje (R8).
- No reintentes la nueva si falla, ni la escondas.
- La subida «Reemplazar» de la tabla vieja borra a los alumnos que no vienen en
  el archivo; la nueva **no borra nunca** notas. Es a propósito: no lo
  «iguales».

**Cierre de la Parte 2:** CI completo en verde. **Para.**

---

# PARTE 3 · La pantalla del técnico: materias por grupo

## Dónde

1. `lib/navegacion/mapa-navegacion.ts`, línea ~273: el apartado
   `act("materias", "Materias", ["Catálogo", "Aliases en volumen", "Visibilidad"])`
   gana un cuarto modo, **«Por grupo»**. Ninguna suite fija esa lista (medido).
2. `app/components/oceano/contenido-tecnico-oceano.tsx`, `case "materias-config"`:
   con el modo «Por grupo» se muestra **solo** el panel nuevo, como hoy
   «Aliases en volumen» añade el suyo.
3. El panel: `app/components/parejas-materias-panel.tsx` (nuevo).

## Qué hace

```ts
import {
  actionListarParejasParaGestion,      // () => { ok, parejas, catalogo } | { ok: false, error }
  actionAltaMateriaEnGrupo,            // (grupoId, materiaId) => { ok, grupoMateriaId } | fallo
  actionCambiarEstadoMateriaEnGrupo,   // (grupoMateriaId, activo) => { ok } | fallo
  actionGuardarAliasPorPareja,         // (grupoMateriaId, nombreVisible) => { ok } | fallo
} from "@/app/actions/calificaciones-normalizadas";
```

- `parejas: ParejaParaGestion[]` = `{ grupoMateriaId, grupoId, grado, grupo,
  materiaId, materiaNombre, materiaClave, alias, activo, tieneTablaFisica }`,
  ya ordenadas por grado, grupo y nombre. Trae **activas e inactivas**.
- `catalogo = { grupos: {id, grado, nombre}[], materias: {id, nombre, clave}[] }`:
  los grupos del ciclo operativo (también los que aún no tienen materias) y
  las materias activas.

La pantalla, agrupada por grupo («1RO A»):

- Cada materia: `alias ?? materiaNombre`, y su estado (activa / desactivada).
  **No hay píldora compartida** en `app/components/ui/` (la propone
  `MATRIZ-UX` §7, F-UX1, sin construir). Pinta el estado con un `<span>` con
  clases, **sin declarar un componente** `Pill`, `Chip` o `Badge`: C11 cuenta
  los componentes con el mismo nombre definidos en más de un archivo, y es un
  trinquete — una copia más lo pone en rojo. **Está en 21/21, en el límite.**
  Lo mismo vale para `Aviso`, que ya se declara en 7 archivos: en el panel
  nuevo, los avisos son elementos con clases, no un `function Aviso`.
- **Desactivar / reactivar.** Desactivar pide confirmación con este texto: «La
  materia deja de mostrarse en este grupo. Sus calificaciones se conservan y
  vuelven si la reactivas.» Es literal así porque es verdad: desactivar nunca
  borra.
- **Alias** editable en línea. Vacío no se guarda (el servidor lo rechaza; muestra
  su mensaje).
- **Alta**: selector de grupo (`catalogo.grupos`) y de materia
  (`catalogo.materias`), y botón. Si la pareja ya existía, el servidor la
  **reactiva** en vez de duplicarla: no lo compruebes tú.
- Tras cada acción, se vuelve a pedir la lista. Los errores del servidor se
  muestran tal cual.

## Lo que NO haces

- **No muestres** `materiaClave` como identidad ni ningún nombre de tabla física
  (C4.28). `tieneTablaFisica` no se pinta.
- **No pidas un periodo**: la action usa el ciclo operativo y no admite otro, a
  propósito.
- No hay borrado. Ni botón, ni action.

**Cierre de la Parte 3:** CI completo en verde. **Para.**

---

## Cierre de cada parte: el CI completo

Hasta que C17 esté en `main`, `npm run test:ci` **no** basta. La lista entera:

```bash
npx tsc --noEmit
npm run lint
npm run test:suites
npm run test:permisos
node scripts/gen-matriz-permisos.mjs --check
node scripts/gen-invariantes.mjs --check
node scripts/gen-rumbo.mjs --check
npm run verificar:estado
npm run verificar:docs
npm run build
```

Si `gen-matriz` o `gen-rumbo` salen desfasados, se regeneran con
`npm run gen:matriz` / `node scripts/gen-rumbo.mjs` y se dice en el informe.
`ESTADO-ACTUAL.md` se actualiza en el MISMO commit que lo vuelva falso
(cuenta de suites, reglas de `test-orden`), y tiene un **límite de 150 líneas**.

## Informe

Uno por parte, corto:

1. qué archivos tocaste y por qué;
2. qué decidiste tú que este prompt no decía (si fue algo, ¿por qué no paraste?);
3. la salida de la lista de cierre;
4. lo que **no** hiciste y por qué.

Un commit por parte, con el porqué en el mensaje.
