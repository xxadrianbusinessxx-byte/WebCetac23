# INFORME — PROMPT H-bis · Las extensiones que le faltaban a `lib/`, y el andamio se retira

**Fecha:** 2026-09-23 · **Rama:** `feature/uis-pendientes` · **Base:** `f68fad6`

## Cómo se ejecutó

Cline arrancó el prompt y se cayó tras la **Parte 1**: dejó `allowImportingTsExtensions`
en `tsconfig.json` y la extensión puesta al único import relativo de
`lib/escolar/ciclo/calendario.ts`. Nada más. Las dos cosas estaban bien —el diff era
exactamente «+`.ts`» y una línea de configuración— y sus tres pruebas pasaban (`tsc` 0,
`build` 0, `calendario.ts` carga con 20 exports). Claude continuó desde ahí hasta el final.

Consecuencia que conviene saber: **en cuanto se aplicó el codemod, el andamio viejo dejó
de funcionar** (`compilar-suites.mjs` emitía JS y `allowImportingTsExtensions` solo vale sin
emitir → `TS5096`). A partir de ese punto no había vuelta a medias: o se terminaba la
Parte 3, o el repo quedaba con 21 suites en rojo.

---

## Antes / después

| | Antes | Después |
|---|---|---|
| Suites en verde con `.tmp-*` borradas | 19 / 40 | **40 / 40** |
| `npm run test:suites` | 29,9 s compilar + 7,9 s suites | **4,3 s**, sin paso previo |
| Carpetas `scripts/.tmp-*` | 14 (13 de `compilar-suites` + 1) + las que cada suite recreaba | **0**, y ninguna se recrea |
| Imports relativos sin extensión en `lib/` | 272 | **0**, vigilado por C13 |
| Reglas en `test-orden` | 12 | **13** |
| Imports que ve el extractor de `test-orden` | 603 de 813 | **813 de 813** |

**Retirado:** `scripts/compilar-suites.mjs` (98 líneas), `scripts/tsconfig.test-ciclo-f3.json`,
`npm run test:compilar`, el paso «Compilar suites puras» del CI, el ignore
`scripts/.tmp-*/**` de ESLint (con su comentario reescrito como relato), la línea de
`.gitignore`, la de `.clineignore` y la excepción `scripts/.tmp-tests/` de `verificar-docs`.

**El CI sube a Node 24.** Sin eso no arranca ni una suite allí: solo Node ≥ 22.18 ejecuta
TypeScript sin flags.

---

## El codemod de `lib/`

`scripts/_archivo/codemod-extensiones-lib.mjs`, en seco primero y luego con `--apply`:

```
Aplicado: 271 especificadores en 83 archivos.
Ninguno sin resolver: las tres condiciones se cumplen en todos.
```

Cuadra al número: 268 `from "…"` medidos + **4 `import()` dinámicos** − 1 que ya había
hecho Cline = **271**, en 84 − 1 = **83 archivos**.

**Los 4 dinámicos no estaban en el recuento del prompt** (que contaba `from "…"`). Entraron
porque el objetivo los necesita: una suite que pasara por esa rama fallaría con
`ERR_MODULE_NOT_FOUND` en tiempo de ejecución, no al cargar.

**El diff es aburrido, comprobado y no supuesto:** se tomaron las 272 líneas quitadas y las
272 añadidas, se borró el `.ts` de las añadidas, y los dos conjuntos son **idénticos**. Cada
línea cambiada es la original más «`.ts`». Nada más.

Una primera versión de esa comprobación estaba mal escrita —comparaba líneas con su
prefijo `+`/`-`, que nunca casan, y un `head -5` escondía que salían todas—. Se rehizo.

---

## Las suites

**40 de 40 dan exactamente el mismo resultado que antes**, con las `.tmp-*` borradas. La
línea base se sacó de `f68fad6` (compilando con el andamio viejo) antes de tocar ninguna,
porque en el árbol a medias no se podía saber qué daban.

Tres familias, tres tratamientos:

| Familia | Cuántas | Cómo cargaban | Conversión |
|---|---|---|---|
| Del mapa de `compilar-suites` | 13 | `require(path.join(dir, "ciclo/x.js"))` | codemod `codemod-suites-a-ts.mjs` |
| Autotranspiladas con tabla `archivos` | 7 | `ts.transpileModule` a su propia `.tmp-*` | codemod `codemod-suites-autotranspiladas.mjs` |
| Autotranspiladas sin patrón común | 7 | cada una a su manera, incluida `tsc -p` | a mano |

**La trampa que el segundo codemod evitó.** Cada `require` se resolvió **contra la tabla
`archivos` de su propia suite**, no con un prefijo fijo. `test-rediseno-oceano` carga seis
módulos de `lib/navegacion/`; con `lib/escolar/` por delante, las seis habrían apuntado a
archivos que no existen.

**Las 6 que pasaban por suerte.** `auditoria-permisos`, `borrar-paso`,
`documentos-permisos`, `permisos`, `reactivacion-inscripciones` y `uis-pendientes` no
fallaban tras el codemod —sus módulos importan solo tipos, que la transpilación borra—,
pero **seguían recreando `.tmp-*` en cada ejecución**. Se convirtieron igual: el objetivo
era que no quedara paso de compilar, no que las suites pasaran.

`test-auditoria-permisos` merece nota: tiene **otro** `for (const fn of archivos)` más abajo
que lee el código de las actions para auditarlo. Se tocó solo el bloque de transpilación.

`test-rediseno-oceano` solo imprime «OK» al final, así que su línea base no probaba el
número. Se sacó de `f68fad6`: **335/335** antes y después.

---

## Lo que no estaba en el prompt y hubo que hacer

### 1 · El codemod rompió un diagnóstico, en silencio

`scripts/diag-alcance-tutor.mjs` transpilaba `buscar-en-filas.ts` a CommonJS. Tras el
codemod, ese módulo importa `./nombres.ts`, y en la carpeta temporal solo existía
`nombres.js`. Reproducido sin red:

```
carga: ROTA -> MODULE_NOT_FOUND | Cannot find module './nombres.ts'
```

**Ni el CI ni ninguna suite lo habría visto**: es un diagnóstico de red, fuera del CI. Se
habría descubierto el día que alguien lo necesitara. Convertido a import directo.

`scripts/gen-seccion4.mjs` seguía funcionando solo porque `permisos.ts` importa únicamente
tipos. Mismo patrón frágil; convertido también. Su salida es idéntica byte a byte (78
filas, `MATRIZ-PERMISOS.md` sin diff).

### 2 · El extractor de `test-orden` no veía el 26 % de los imports

`importsDe()` usaba `[^;\n]*?` entre `import` y `from`, así que **cortaba en el salto de
línea y no veía ningún import multilínea**:

```
imports en app/ + lib/   · importsDe veía: 603  · había: 813  · invisibles: 210
imports @/ en lib/       · importsDe veía:   5  · había:   8
```

C1, C2, C3 y C4 dependen de ese extractor. Se comprobó que los 3 `@/` invisibles están en
`lib/auth/portal-login.ts`, **fuera** del ámbito de C1: hoy no había violación escondida.

Corregido a `[^;]*?` (cruza líneas dentro de una sentencia, sigue anclado en
`import`/`export`) más los imports de efecto lateral (`import "server-only"`), que es
justo la forma que C3 debería poder ver. Medido contra un `from "…"` sin ancla: **los dos
ven los mismos 813**.

**Las doce reglas dieron exactamente lo mismo antes y después.** Acertaban por suerte;
ahora aciertan por construcción.

### 3 · C13 — sin ella, H-bis se deshace con el primer import nuevo

Comprobado sobre el árbol real: quitando la extensión a un import de `calendario.ts`,

```
tsc --noEmit   exit 0      ← lo acepta en silencio
node           ERR_MODULE_NOT_FOUND
```

`allowImportingTsExtensions` hace que `tsc` y el build acepten **las dos formas**. Una
regresión así solo la vería la suite que cargue ese módulo, si existe. Se añadió **C13**:
todo import relativo de `lib/` lleva extensión. Dura, umbral 0.

**Se vio fallar**, y precisamente sobre un import **multilínea** — el que el extractor viejo
no veía:

```
FALLA  C13  lib/** importa con extensión explícita …  ·  1
       lib/escolar/ciclo/calendario.ts  —  import sin extensión: "../tables"
```

Sin el arreglo del punto 2, C13 habría estado en verde con el repo roto.

### 4 · Documentación que mentía

- 16 cabeceras de suite explicaban cómo compilarlas (`npx tsc … --outDir scripts/.tmp-…`).
- **`ORDEN.md` §1b es normativo** y decía que los imports se escriben `./x` porque «las
  suites compilan con `tsc`». Reescrito: relativos **y con extensión**, con los dos motivos
  (Node no resuelve `@/`, Node exige extensión) y sus dos vigilantes (C1, C13). La fila
  `scripts/.tmp-*` salió de su tabla de carpetas.
- El comentario de C1 en `test-orden.mjs` daba el motivo viejo. La regla sobrevive intacta:
  su porqué cambió de camino, no de fondo.
- `scripts/README.md`: la sección «Antes de correr cualquier suite pura» describía el
  mundo de compilar frase a frase. Reescrita. La fila de `test-rediseno-oceano` decía
  **180 verificaciones**; son **335**.
- `README.md`, `docs/00-INDICE.md` y `ESTADO-ACTUAL.md` §7-§8.

Se dejaron **a propósito** tres menciones que narran el pasado: el pendiente cerrado de
`pendientes.json`, la foto fechada `EVALUACION-REPO-2026-09-08.md` y `PROMPT_F`.

### 5 · Un error de procedimiento, sin daño

Para ver si `gen-seccion4.mjs` tenía ayuda se corrió con `--help`. **No tiene modo seco**:
se ejecutó de verdad y reescribió la §4 de `MATRIZ-PERMISOS.md`. Se comprobó enseguida:
**0 líneas de contenido cambiadas** —la regeneración es idempotente, como debe ser—. Dejó
una `.tmp-sec4`, que se borró. Queda anotado porque la lección vale: un script de este
repo no se ejecuta para ver qué hace; se lee su cabecera.

---

## Validación

```
1) test:suites (sin .tmp)   Resultado: 40/40 suites en verde
2) tsc --noEmit             exit=0
3) build                    exit=0
4) lint                     exit=0 · 1 problem (0 errors, 1 warning)
5) test-orden               exit=0 · Todo en orden: 13 reglas comprobadas.
6) verificar-docs           exit=0
7) test:ci                  exit=0
8) test:permisos            exit=0
9) gen-invariantes --check  exit=0
10) gen-rumbo --check       exit=0
11) verificar-estado-actual exit=0

.tmp-* tras toda la validación: 0
```

**Lint al quitar el ignore de `.tmp-*`: 0 errores.** El único warning es el `MARCA` sin usar
de `gen-panel.mjs`, que ya existía. Las carpetas ya no existen, así que no había nada que
el ignore estuviera tapando.

---

## Pendiente

- **El aviso `MODULE_TYPELESS_PACKAGE_JSON`.** Node avisa al cargar cada `.ts` porque
  `package.json` no declara `"type": "module"`, y lo re-parsea como ESM con un coste de
  rendimiento. **No se tocó**, como pedía el prompt: `"type": "module"` cambia la semántica
  de cualquier `.js` del repo y de las dependencias que lo asuman. Candidato a medirse
  aparte.
- **Un módulo con `import "server-only"` no se puede cargar desde una suite.** Nueve archivos
  de `lib/` lo hacen (`cloudinary/*`, `tutores/*`, `exportar-xlsx`). Hoy ninguna suite los
  carga. Queda escrito en `scripts/README.md`: lo que se quiera probar de ahí va a un `-puro`.
- `test-orden.mjs` y `gen-estado.mjs` siguen saltando carpetas `.tmp-*` al recorrer el árbol.
  Es un filtro defensivo de una palabra y se deja.
