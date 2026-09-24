# PROMPT CLINE — H-bis · Las extensiones que le faltaban a `lib/`, y el andamio se retira

## Por qué existe este prompt: el PROMPT H tenía una premisa falsa, y era mía

H afirmaba que ejecutar TypeScript en Node «sale gratis» porque el repo no usa
`enum` ni `namespace`. Eso comprueba el **type stripping** y es cierto. Lo que no
comprobó —y era lo que decidía— es la **resolución de módulos**: el resolver ESM
de Node exige la extensión exacta, y `lib/` escribe sus imports relativos sin
ella. Parar en la primera suite fue lo correcto.

**Lo que ha cambiado desde entonces:** se midió si el camino estaba realmente
cerrado, y no lo está. Con la extensión puesta en un import real:

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` con `from "../tables.ts"` | ❌ `TS5097` |
| ídem **+ `allowImportingTsExtensions: true`** | ✅ exit 0 |
| **`npm run build`** con la extensión dentro | ✅ **exit 0**, las 10 rutas |
| `import('./lib/escolar/ciclo/calendario.ts')` desde Node | ✅ carga, 20 exports |

`allowImportingTsExtensions` es compatible con este `tsconfig.json` sin tocar
nada más, porque ya tiene `noEmit: true` — que es justo la condición que TS
exige para permitirlo.

Así que H sí era alcanzable. Lo que lo bloqueaba era el límite «no toques `lib/`»
del prompt, no una limitación de Node.

## OBJETIVO — qué debe ser cierto al terminar

1. Los imports relativos de `lib/**` llevan extensión explícita.
2. Las **39 suites** importan `lib/**.ts` directo y pasan **con las carpetas
   `scripts/.tmp-*` borradas**.
3. Desaparecen `compilar-suites.mjs`, `npm run test:compilar`, las 13 `.tmp-*`
   restantes, su ignore en `eslint.config.mjs` y su paso en el CI.
4. El CI corre en **Node 24**.

Sigue siendo un prompt que deja el repo **más pequeño**.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto.mjs --tarea=crear lib/escolar/ scripts/
```

## MEDICIÓN INICIAL (pegada — no re-investigar)

Lo que hay que cambiar, medido el 2026-09-20 resolviendo cada especificador
contra el disco:

```
imports relativos sin extensión en lib/**   268   (88 especificadores únicos, 84 archivos)
  · resuelven a un hermano .ts              268   ← el 100 %
  · apuntan a un directorio (/index.ts)       0
  · apuntan a un .tsx                         0
  · no resuelven a nada                       0
de esos 268, `export … from` (re-exports)    16
```

**Esta es la cifra que hace el trabajo mecánico:** no hay un solo caso especial.
Cada `from "../x"` se convierte en `from "../x.ts"` y el archivo existe. No hay
que decidir nada, y por eso el riesgo está en ejecutarlo mal, no en diseñarlo.

Estado heredado de H: el piloto `test-fechas.mjs` ya importa `.ts` directo y
`test:compilar` bajó de 14 a **13 objetivos**. Quedan **38 suites** y 13 carpetas.

---

## SECUENCIA — cuatro partes, con parada entre cada una

### Parte 1 · Un archivo, y las tres pruebas

**No lances el codemod todavía.** Primero, a mano:

1. `tsconfig.json`: añade `"allowImportingTsExtensions": true` en
   `compilerOptions`, con un comentario en el informe (no en el JSON, que no
   admite comentarios) explicando que es lo que permite que Node cargue `lib/`
   sin compilar.
2. Elige **`lib/escolar/ciclo/calendario.ts`** —es el que reveló el problema— y
   pon la extensión a todos sus imports relativos.
3. Las tres pruebas, en este orden:

```bash
npx tsc --noEmit                                   # 0 errores
npm run build                                      # exit 0
node -e "import('./lib/escolar/ciclo/calendario.ts').then(m=>console.log(Object.keys(m).length))"
```

Si las tres pasan, el mecanismo está confirmado sobre el árbol real y el resto
es repetición. Si alguna falla, **para**: el experimento que autoriza este prompt
se hizo sobre un solo import y puede haber algo que no vio.

**PARA AQUÍ.** Enseña el diff del archivo y la salida de las tres.

### Parte 2 · El codemod sobre los 84 archivos

Escríbelo como un script de un solo uso y **déjalo en `scripts/_archivo/`**
cuando termine, que es donde ORDEN.md §4 manda lo que se consume una vez.

Reglas del codemod, todas comprobables:

- Solo toca `lib/**/*.ts`. Nada de `app/`, nada de `scripts/`.
- Solo especificadores que empiecen por `./` o `../`. **Los `@/` no se tocan**:
  los resuelve el bundler, no Node.
- Solo si **ya no tienen extensión** y **existe el `.ts` hermano**. Si alguno no
  cumple, no lo toques y **repórtalo** — la medición dice que son 0, así que
  cualquier aparición es información nueva.
- Cubre `import … from`, `export … from` (los 16) e `import type`.
- No reescribas nada más de la línea: ni comillas, ni orden, ni espaciado. El
  diff tiene que ser legible como «+`.ts`» y nada más.

Al terminar, el recuento tiene que dar **0**:

```bash
grep -rhoE 'from "\.\.?/[A-Za-z0-9_./-]+"' lib --include=*.ts | grep -vcE '\.(ts|tsx|js|json)"$'
```

**PARA AQUÍ.** `npx tsc --noEmit`, `npm run build` y `npm run lint`, los tres en
verde, antes de tocar una sola suite.

### Parte 3 · Las 38 suites restantes

Ahora sí, lo que H no pudo: cada suite cambia su `import("./.tmp-x/y.js")` por
la ruta real `"../lib/…/y.ts"`.

El objeto `SUITES` de `compilar-suites.mjs` es el mapa de qué módulo vivía en qué
carpeta: úsalo como lista de trabajo. Ojo con las que compilan varios módulos a
la misma carpeta — cada import va a su propio archivo de `lib/`.

**El criterio de éxito no es que pase: es que pase con la carpeta borrada.**

```bash
rm -rf scripts/.tmp-*
npm run test:suites        # 40/40, sin recompilar nada
```

Y lo que hay que vigilar de verdad: **ninguna suite puede cambiar de resultado**.
Mismos casos, mismos números. Si una empieza a fallar al cargar el `.ts` directo,
el hallazgo es que el compilado y el fuente no eran lo mismo — para y dilo, eso
importa más que este prompt entero.

**PARA AQUÍ.** Reporta el tiempo de `npm run test:suites` frente a los 7,9 s + 29,9 s de hoy.

### Parte 4 · Retirar el andamio

Solo con la Parte 3 en verde:

- Borra `scripts/compilar-suites.mjs` y su fila de `scripts/README.md`.
- Quita `test:compilar` de `package.json` y de donde se encadene.
- Quita el paso «Compilar suites puras» del workflow.
- **`node-version: 20` → `24`.** Sin esto, en CI no arranca ni una suite.
- Quita el ignore `scripts/.tmp-*/**` de `eslint.config.mjs`, **reescribiendo su
  comentario** para contar que la cuarentena murió con el paso de compilación.
  Ese comentario es el relato de por qué el lint estuvo roto con 135 errores
  fantasma; no se borra, se actualiza.
- `scripts/.tmp-*/` fuera de `.gitignore` y `.clineignore`.
- Menciones a `test:compilar` en `AGENTS.md`, `docs/00-INDICE.md` y
  `ESTADO-ACTUAL.md` §8, que dice «si tocaste un módulo puro, antes de la suite:
  `npm run test:compilar`».
- `test-orden` C10 baja al borrar scripts: **aprieta el umbral**.

---

## REGLAS

- **El diff de la Parte 2 tiene que ser aburrido.** 268 veces `+.ts` y nada más.
  Si el codemod toca comillas, orden de imports o formato, rehazlo: un diff
  ruidoso aquí es imposible de revisar y esto pasa por `lib/` entero.
- **Ninguna suite cambia lo que comprueba.** Ni un caso, ni un número esperado.
- **Ninguna dependencia nueva.** Ni `tsx`, ni `ts-node`, ni un runner. Si te
  descubres instalando algo para resolver módulos, has vuelto al andamio que
  este prompt retira.
- No bajes ningún umbral. C10 se **aprieta**.

## LÍMITES — qué NO se toca

- El **contenido** de `lib/**`: solo cambian los especificadores de import
- `app/**` entero, incluidos sus `@/`
- `lib/auth/**` más allá del mismo cambio de extensión
- `docs/historial/**`, `scripts/_peligrosos/`

## VALIDACIÓN — al cierre de CADA parte

```bash
rm -rf scripts/.tmp-*          # el criterio de verdad
npm run test:suites
npx tsc --noEmit
npm run build
npm run lint
node scripts/test-orden.mjs
node scripts/verificar-docs.mjs
npm run test:ci
```

`npm run lint` merece mirada aparte: al quitar el ignore de `.tmp-*` debería
seguir en **0 errores**. Si aparecen, no son nuevos — son los que el ignore
tapaba, y hay que decir cuántos.

## Una nota que NO es parte del objetivo

Al cargar un `.ts` Node avisa:

```
[MODULE_TYPELESS_PACKAGE_JSON] … Reparsing as ES module … This incurs a performance overhead.
```

Se silencia con `"type": "module"` en `package.json`. **No lo hagas en este
prompt.** Cambia la semántica de cualquier `.js` del repo y de las dependencias
que lo asuman, y el aviso no rompe nada. Anótalo en el informe como candidato a
medir aparte.

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-H-BIS-EXTENSIONES-EXPLICITAS.md`:

### Antes / después
Líneas y archivos borrados, carpetas eliminadas, y `test:suites` antes y ahora.

### El codemod
Cuántos especificadores tocó, cuántos archivos, y **cualquiera que no cumpliera
las tres condiciones**. La medición dice 0; si aparece alguno, es el hallazgo.

### Las suites
Confirmación de que las 40 dan el mismo resultado que antes, y con `.tmp-*`
borradas. Si alguna reveló que el compilado y el fuente diferían, va primero.

### Validación
Los ocho comandos, más el recuento de lint.

---

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
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

> **Autorización explícita del punto 3, acotada a este prompt:** sí se borran
> `compilar-suites.mjs`, sus carpetas y sus enganches. No es legacy de producto
> —no lo protege R8—: es andamio de una limitación de Node que dejó de existir.
> Nada de `lib/` ni de `app/` se borra, y ninguna migración de datos entra aquí.
