# INFORME — PROMPT H · Node ejecuta TypeScript: la premisa es cierta y no alcanza

> Ejecutado el 2026-09-20 sobre `feature/uis-pendientes` (HEAD `c0705ff`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_H_TS_NATIVO.md`.
>
> **Parte 1 hecha y verificada. Partes 2 y 3 DETENIDAS en la primera suite restante**, que es
> lo que el prompt ordena en su sección «Parte 1»: *«Si la suite necesita algo más que cambiar
> la ruta —una extensión implícita, un `.js` en el import de un módulo de `lib/`— **para y
> repórtalo antes de seguir**»*. Y eso es exactamente lo que aparece, 8 veces de 8.
>
> **El repo es más pequeño:** una carpeta `.tmp-*` menos, `test:compilar` pasa de 14 a 13
> objetivos, y ninguna suite cambia de resultado (39/39). Lo que **no** se logró es el objetivo
> grande —borrar `compilar-suites.mjs` y los ~30 s de cada vuelta—, porque la causa que lo
> impide es una sola y vive en `lib/`.

---

## 1 · El hallazgo, primero: Node ejecuta TypeScript, pero no resuelve sus imports

El prompt lo dice en su medición inicial y es verdad:

```
$ node --version          → v24.15.0
$ node /tmp/p.ts          → TS nativo OK: 5
$ grep -rn "^export enum\|^enum \|namespace " lib app --include=*.ts --include=*.tsx | wc -l → 0
```

Comprobado otra vez antes de tocar nada: `import("./lib/escolar/fechas.ts")` funciona, sin
flags ni dependencias. El *type stripping* borra los tipos, y como el repo no usa `enum`,
`namespace` ni propiedades de parámetro, sale gratis.

**Lo que el prompt no vio es que el type stripping da la sintaxis, no la resolución.** El
resolver ESM de Node exige la **extensión exacta** del archivo en todo import relativo, y
`lib/` los escribe **sin extensión**: así lo acepta `tsc`, así los resolvía el paso de
compilación a CommonJS, y así lo exige C1 de `ORDEN.md` §1b («ruta relativa, nunca `@/`») — que
no dice nada de extensiones porque hasta hoy no hacía falta.

```
$ node -e "import('./lib/escolar/ciclo/calendario.ts')"
ERR_MODULE_NOT_FOUND: Cannot find module '…\lib\escolar\tables'
                      imported from …\lib\escolar\ciclo\calendario.ts
```

Y no es un caso aislado: es la forma normal del repo.

| Ámbito | Imports relativos sin extensión | Archivos |
|---|---|---|
| `lib/escolar/**` | **142** | 59 |
| resto de `lib/**` | 22 | 14 |
| `app/**` | 22 | 9 |
| **Total** | **186** | **82** |

Medido con una sonda de solo lectura que se borró al terminar (`listarTs` + el mismo
`importsDe` de `test-orden.mjs`). De los **120** archivos `.ts` de `lib/`, **40** se pueden
importar nativamente y **80** no — y el primer specifier que rompe aparece siempre en la
primera línea del grafo que cruza de carpeta.

### Lo que se comprobó y **no** sirve

| Camino | Resultado |
|---|---|
| `await import(".../calendario.ts")` | `ERR_MODULE_NOT_FOUND` en `../tables` |
| `createRequire()("../lib/escolar/ciclo/calendario.ts")` | Falla igual: el archivo es ESM por sintaxis, así que sus propios imports los resuelve el **resolver ESM**, no el de CommonJS |
| `--experimental-specifier-resolution=node` | Ya no existe en Node 24: la bandera se ignora |
| Reescribir `.js` → `.ts` | Node no lo hace: busca `b.js` de verdad y falla |
| `tsconfig.json` (`moduleResolution`, `allowImportingTsExtensions`) | Node **no lee tsconfig**: es configuración de `tsc`, no del runtime |


### Qué suite queda bloqueada por esto

De las 39 suites, **14** dependen de `npm run test:compilar` (una por cada carpeta de
`SUITES`); las otras 25 se transpilan solas con `ts.transpileModule`. De esas 14:

| | Suites | Módulo que importaría | Primer specifier que rompe |
|---|---|---|---|
| **OK** | `test-fechas` | `lib/escolar/fechas.ts` | — (hecha, ver §2) |
| OK | `test-asistencia-parciales` | `asistencia/asistencia-parcial.ts` | — |
| OK | `test-atribucion-profesor` | `asistencia/atribucion-profesor.ts` | — |
| OK | `test-asistencia-contexto` | `asistencia/asistencia-contexto.ts` | — |
| OK | `test-roster-validacion` | `catalogo/roster-validacion.ts` | — |
| OK | `test-orden-alumnos` | `alumno/orden-alumnos.ts` | — |
| **NO** | `test-ciclo-calendario` | `ciclo/calendario.ts` | `../tables` |
| NO | `test-calendario-periodo-f5` | `ciclo/calendario.ts` | `../tables` |
| NO | `test-ciclo-estado` | `ciclo/ciclo-estado.ts` · `ciclo/orquestador-ciclo.ts` | `./calendario`, `./contexto-ciclo` |
| NO | `test-activacion-ciclo-f8` | `ciclo/ciclo-estado.ts` | `./calendario` |
| NO | `test-evaluaciones` | `ciclo/evaluaciones.ts` · `horario/horario-importar.ts` · `ciclo/contexto-ciclo.ts` | `./ciclo-estado`, `./horario-importar-lectura`, `../horario/horario-semanal` |
| NO | `test-inscripciones-f3` | `catalogo/inscripciones-borrador.ts` | `../tables` |
| NO | `test-justificacion-por-clase` | `asistencia/justificaciones.ts` | `../tables` |
| NO | `test-reparar-tabla-legacy` | `ciclo/contexto-ciclo.ts` | `../horario/horario-semanal` |

**8 de 14, y las 8 por la misma línea.** El prompt avisó de que una sola bastaba: *«las 38
restantes lo van a repetir 38 veces»*.

### Y explica las otras 25

Las 25 suites que se transpilan solas con `ts.transpileModule` no nacieron por capricho:
**cada una lleva a mano la lista de módulos que necesita**, porque no puede resolver el grafo
transitivamente. El propio `scripts/README.md` lo advierte —«si añades un `import` al módulo
bajo prueba, hay que añadir esa dependencia a la lista o la suite falla con `Cannot find
module`»— y el fallo del harness que quedó documentado en
`docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md` («`test-mapeo-columnas-materia` transpila
`schema-tabla.ts` sin su dependencia `openapi.ts`») es un síntoma de lo mismo.

Es decir: **el problema de extensión es la causa raíz de los dos mecanismos**, no solo del que
este prompt venía a borrar. Ahí está el tamaño real del hallazgo.

### Las dos salidas, para que las decida una persona

Ninguna de las dos está autorizada por este prompt, y por eso no se hizo ninguna.

**A · Poner la extensión en `lib/` (186 imports, 82 archivos).** Es el arreglo de verdad: deja
a Node poder ejecutar el repo tal cual, permite borrar `compilar-suites.mjs`, las 14 carpetas y
las 25 listas a mano. Coste y riesgo: es **código de producto**, prohibido por los LÍMITES de
este prompt; exige `allowImportingTsExtensions` en `tsconfig.json` (compatible con el
`noEmit: true` que el repo ya tiene) y volver a verificar `next build`; y deja el repo con una
convención de import distinta de la que tenía. Es su propio prompt.

**B · Un resolvedor propio registrado con `module.register()`.** Unas 30 líneas sin
dependencias que añaden `.ts` a los specifiers relativos sin extensión, invocables desde cada
suite sin banderas. Hace funcionar las 39 hoy. Coste: es exactamente la herramienta casera que
las REGLAS prohíben en espíritu («Ni `tsx`, ni `ts-node`, ni un runner… meter una herramienta
aquí es justo lo contrario del objetivo»), la API de hooks es semiexperimental, y el repo
dependería de una resolución que **no es la de la plataforma** — con lo que un Node futuro
podría romperlo en silencio. Recomendación: no.

**C · No hacer nada más, que es el estado de hoy documentado en este informe.**

---

## 2 · La suite piloto (Parte 1 · HECHA)

`scripts/test-fechas.mjs`, diff completo:

```diff
-// Importa el módulo compilado a JS (ver PASO de compilación en el README del
-// script). Para recompilar tras cambios en lib/escolar/fechas.ts:
-//   npx tsc lib/escolar/fechas.ts --outDir scripts/.tmp-fechas \
-//     --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
+// PROMPT H (2026-09-20): Node ejecuta TypeScript nativamente (type stripping),
+// así que la suite importa el FUENTE, no una copia compilada en `scripts/.tmp-*`.
+// Se acabó el "recompila antes de probar o el resultado miente": lo que se prueba
+// es el archivo que se edita. Requiere Node >= 22.6 (el CI fija la versión).
 const {
   normalizarFechaEscolar,
   detectarColumnasFechaAsistencia,
   serialExcelAFechaISO,
-} = await import("./.tmp-fechas/fechas.js");
+} = await import("../lib/escolar/fechas.ts");
```

Resultado **antes**, con la carpeta presente:

```
Resultado: 22 pasadas, 0 fallidas
```

Resultado **después, con `scripts/.tmp-fechas/` borrada** (`Test-Path` → `False`):

```
$ rm -rf scripts/.tmp-fechas
$ node scripts/test-fechas.mjs
Resultado: 22 pasadas, 0 fallidas      ← los mismos 22 casos, exit 0
```

Ese es el criterio que pedía el prompt —*«no que compile, sino que pase con la carpeta
borrada»*— y se cumple. Ni un caso se tocó.

Además se quitó `.tmp-fechas` del objeto `SUITES` de `compilar-suites.mjs` (con un comentario
que dice por qué), para que el paso de compilación deje de regenerar una carpeta que ya nadie
lee: `test:compilar` pasa de `14/14` a **`13/13`** y la carpeta no vuelve.

---

## 3 · Antes / después

| | Antes | Después |
|---|---|---|
| `scripts/test-fechas.mjs` | 9 líneas (4 de comentario + 1 import) | 9 líneas — **neto 0** |
| `scripts/compilar-suites.mjs` | 91 líneas, 14 objetivos | 95 líneas, **13** objetivos (−1 fila de `SUITES`, +5 de comentario) |
| Carpetas `scripts/.tmp-*` de `test:compilar` | 14 | **13** |
| `npm run test:compilar` | 36.6 s | 36.6 s (**sin cambio**: quedan 13 objetivos) |
| `npm run test:suites` | 11.0 s | **8.5 s** (39/39 en ambos) |
| Suites que importan `.ts` directo | 0 de 39 | **1 de 39** |

**Los ~30 s NO se han salvado**, y decir lo contrario sería el error de este informe: el 79 %
del ciclo sigue ahí porque las Partes 2 y 3 no se pudieron hacer. Lo que sí se salvó: una
carpeta temporal, una entrada del compilador, y el hecho de que `test-fechas.mjs` ya no puede
mentir probando una copia vieja del módulo.

---

## 4 · Validación

Los ocho comandos, en serie (ver la nota de abajo: **en paralelo dan fallos falsos**):

| Comando | Resultado |
|---|---|
| `rm -rf scripts/.tmp-*` | **NO ejecutado**: es el criterio de la Parte 2, y borraría las carpetas que las 8 suites bloqueadas todavía necesitan. Sí se borró `scripts/.tmp-fechas`, que es el criterio de la Parte 1 |
| `npm run test:suites` | **39/39 en verde** en serie |
| `node scripts/test-orden.mjs` | 10 reglas, `Todo en orden` (C10 en 34/34, su umbral) |
| `node scripts/verificar-docs.mjs` | `OK: el sistema de documentación está sano` |
| `npm run test:ci` | exit 0 — suites 39/39 · invariantes «Al día» · rumbo «Al día» · ESTADO-ACTUAL al día · docs sanas |
| `npx tsc --noEmit` | 0 errores, 0 líneas de salida |
| `npm run lint` | **0 errores**, 1 warning **preexistente** (`scripts/gen-panel.mjs:41 'MARCA' never used`). No apareció nada nuevo: el ignore `scripts/.tmp-*/**` sigue en pie porque las carpetas siguen existiendo (Parte 3 no hecha) |
| `npm run build` | exit 0, `✓ Compiled successfully in 5.6s`, 4 rutas estáticas |

### Nota de método: dos tandas en paralelo dan fallos falsos

Durante la validación corrí dos tandas de suites a la vez y salieron **37/39**, con fallos
**distintos en cada corrida** y en suites que no toqué (`test-columnas-calificaciones`,
`test-materia-avance`, `test-materia-identidad`, `test-mapeo-columnas-materia`) y que **pasan
solas, una por una** (verificado: 5/5 exit 0). La causa: esas cuatro suites comparten la MISMA
carpeta `scripts/.tmp-tests/` y cada una la vacía al arrancar; dos procesos en el mismo árbol se
pisan. En serie, 39/39 de forma reproducible.

No es una regresión de este prompt —es un dato del diseño que el prompt viene a desmontar—,
pero queda anotado en `scripts/README.md` para que no se confunda con una regresión la próxima
vez. Es, además, la segunda razón por la que `.tmp-*` es frágil: no solo puede faltar, puede
estar siendo escrito por otro.

---

## 5 · Qué se tocó y qué NO

**Tocado (3 archivos de `scripts/`):** `test-fechas.mjs` (el import),
`compilar-suites.mjs` (fuera `.tmp-fechas`), `README.md` (qué suite ya no compila, y el aviso
de las tandas en paralelo).

**NO tocado, pudiendo haberlo hecho:**

- **`lib/**` y `app/**`**: ni una línea. Es lo que impide resolver el problema de raíz y lo que
  el prompt prohíbe explícitamente. Las 186 extensiones que faltan son la decisión de la opción A.
- **Las otras 38 suites**: 25 de ellas ni usan `test:compilar`, y las 6 que sí podrían importar
  `.ts` directo se dejaron como estaban para no partir el corpus en dos mecanismos de carga
  mientras la Parte 3 (borrar el andamio) siga siendo imposible. Convertir 6 de 39 no ahorra el
  paso de compilación —hay que compilar igual para las 8 bloqueadas— y sí introduce una segunda
  forma de cargar módulos que nadie pidió.
- `compilar-suites.mjs` **no se borró**, ni su fila de `scripts/README.md`, ni `test:compilar`,
  ni el paso del CI, ni el ignore de `eslint.config.mjs`, ni `.gitignore`, ni `.clineignore`, ni
  `node-version: 24`. Es la Parte 3, y la Parte 3 solo se hace cuando la Parte 2 está en verde.
- **`test-orden.mjs` C10**: no se apretó, porque no se borró ningún script (`compilar-suites.mjs`
  sigue existiendo: 91 → 95 líneas). Apretarlo ahora sería apretarlo contra un cambio que no
  ocurrió — y con el cambio real (borrar `compilar-suites.mjs`) C10 bajaría en 1, a 33.

---

## 6 · Lo que haría falta para cerrar el prompt de verdad

Una decisión de una persona, entre la opción A y la C de §1. Si la respuesta es **A** (poner las
186 extensiones), el trabajo restante encaja en el prompt tal como está escrito:

1. Poner `.ts` en los 186 imports relativos sin extensión (82 archivos) y `allowImportingTsExtensions`
   en `tsconfig.json`.
2. Verificar `npx tsc --noEmit` + `npm run build` **antes** de tocar ninguna suite: si el build se
   rompe, el problema es del paso 1, no de las suites.
3. Cambiar los `require`/`import` de las 39 suites a la ruta `.ts` real — y con eso las 25 suites
   que hoy mantienen su lista a mano pueden borrarla, que es donde está el segundo ahorro.
4. Ahí sí: borrar `compilar-suites.mjs`, `test:compilar`, las 14 carpetas, el paso del CI, el
   ignore de `eslint.config.mjs`, el `.gitignore`, el `.clineignore`, subir el CI a Node 24 y
   apretar C10 a 33.


