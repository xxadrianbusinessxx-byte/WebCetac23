# PROMPT CLINE — H · Node ejecuta TypeScript: sobra el paso de compilar

## OBJETIVO — qué debe ser cierto al terminar

Las 39 suites importan los módulos de `lib/` **directamente en `.ts`**, y
desaparecen cuatro cosas que solo existían para sostener el paso intermedio:

1. `scripts/compilar-suites.mjs` (98 líneas) y `npm run test:compilar`.
2. Las 14 carpetas `scripts/.tmp-*`, y con ellas el footgun de que **un clon
   limpio falla** con `ERR_MODULE_NOT_FOUND` hasta que alguien recompila.
3. El ignore `scripts/.tmp-*/**` de `eslint.config.mjs` — que existe porque esos
   artefactos generaban **135 de los 151 errores** del 2026-09-16 y enterraban
   los ~29 reales (`docs/sistema/PENDIENTES-2026-09-16.md` §1).
4. Unos 30 segundos en cada vuelta de pruebas, local y en CI.

**Este prompt hace el repo más pequeño.** Si al terminar hay más líneas que al
empezar, algo se hizo de más.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto.mjs --tarea=crear scripts/
```

## MEDICIÓN INICIAL (pegada — no re-investigar)

**Node ya ejecuta TypeScript sin flags ni dependencias.** Comprobado el
2026-09-20 sobre `v24.15.0`:

```
$ node /tmp/p.ts
TS nativo OK: 5
```

Lo que hace posible el cambio, y hay que volver a comprobarlo antes de tocar
nada, porque si esto no es 0 el prompt no aplica:

```
$ grep -rn "^export enum\|^enum \|namespace " lib app --include=*.ts --include=*.tsx | wc -l
0
```

El *type stripping* de Node borra los tipos, no los transforma: `enum`,
`namespace` y las propiedades de parámetro de constructor **no** funcionan sin
`--experimental-transform-types`. Este repo no usa ninguno, por eso sale gratis.

Lo que cuesta hoy el paso que se elimina:

```
npm run test:compilar   29.9 s
npm run test:suites      7.9 s     ← el trabajo de verdad
```

**El 79 % del ciclo es preparar, no probar.**

Las 14 carpetas y su contenido están declarados en el objeto `SUITES` de
`scripts/compilar-suites.mjs`:

```
.tmp-fechas  .tmp-asistencia-parciales  .tmp-atribucion-profesor  .tmp-evaluaciones
.tmp-justificacion-clase  .tmp-reparar-tabla-legacy  .tmp-ctx  .tmp-rv  .tmp-cal
.tmp-ciclo-estado  .tmp-insc-f3  .tmp-f8  .tmp-f5  .tmp-orden-alumnos
```

Y así es como una suite importa hoy (`scripts/test-fechas.mjs`):

```js
} = await import("./.tmp-fechas/fechas.js");
```

que tiene que pasar a ser, sin más ceremonia:

```js
} = await import("../lib/escolar/fechas.ts");
```

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · Una sola suite, de punta a punta

**No conviertas las 39 a ciegas.** Empieza por `scripts/test-fechas.mjs`, que es
la más simple y la que compila un único módulo:

1. Cambia su `import()` a la ruta `.ts` real de `lib/`.
2. `node scripts/test-fechas.mjs` — tiene que dar **exactamente el mismo
   resultado que ahora**, mismo número de casos pasados.
3. Borra `scripts/.tmp-fechas/` y vuelve a correrla. **Si pasa con la carpeta
   borrada, el cambio funciona**; ese es el criterio, no que compile.

Si la suite necesita algo más que cambiar la ruta —un `require` encubierto, una
extensión implícita, un `.js` en el import de un módulo de `lib/`— **para y
repórtalo antes de seguir**: significa que hay un supuesto que este prompt no vio
y las 38 restantes lo van a repetir 38 veces.

**PARA AQUÍ.** Enseña el diff de esa suite y su salida con la `.tmp` borrada.

### Parte 2 · Las 38 restantes

Mismo cambio, suite a suite. El objeto `SUITES` de `compilar-suites.mjs` te da el
mapa exacto de qué módulo vivía en qué carpeta: úsalo como lista de trabajo y
ve tachando.

Ojo con las que compilan **varios** módulos a la misma carpeta (`.tmp-evaluaciones`
lleva tres, `.tmp-cf3` y `.tmp-ciclo-estado` llevan varios): cada import se
resuelve a su propio archivo de `lib/`, no todos al mismo.

Al terminar, `scripts/.tmp-*` no debe existir y `npm run test:suites` debe dar
**39/39 en verde desde un árbol sin carpetas temporales**.

**PARA AQUÍ.** Reporta el tiempo nuevo de `npm run test:suites`.

### Parte 3 · Retirar el andamio

Solo cuando la Parte 2 esté en verde:

- Borra `scripts/compilar-suites.mjs` y su fila de `scripts/README.md`.
- Quita `test:compilar` de `package.json`, y de `test:ci` si aparece.
- Quita el paso «Compilar suites puras» de `.github/workflows/verificacion.yml`.
- **Sube el CI a `node-version: 24`.** Es la línea que hace que todo esto
  funcione allí: Node 20 no sabe ejecutar TypeScript y las suites fallarían.
- Quita el ignore `scripts/.tmp-*/**` de `eslint.config.mjs`, **conservando el
  comentario** reescrito para decir que la cuarentena desapareció con el paso de
  compilación. Ese comentario es el relato de por qué el lint estuvo roto.
- Quita `scripts/.tmp-*/` de `.gitignore` y de `.clineignore` si están.
- `docs/00-INDICE.md` y `AGENTS.md`: cualquier mención a `test:compilar` se cae.
- `test-orden.mjs` C10 baja en 1 al borrar un script: **aprieta el umbral**, no
  lo dejes flojo.

---

## REGLAS

- **El criterio de éxito es la carpeta borrada.** Una suite que pasa porque
  todavía existe su `.tmp-*` no está convertida.
- No cambies **nada** de lo que una suite comprueba: ni un caso, ni un número
  esperado. Esto es un cambio de fontanería. Si una suite empieza a fallar al
  cargar el `.ts` directo, el hallazgo es que **el módulo compilado y el fuente
  no eran lo mismo** — para y dilo, eso es más importante que este prompt.
- No añadas ninguna dependencia. Ni `tsx`, ni `ts-node`, ni un runner. Node lo
  hace solo; meter una herramienta aquí es justo lo contrario del objetivo.

## LÍMITES — qué NO se toca

- El contenido de `lib/**` y `app/**`: este prompt no toca código de producto
- `scripts/_peligrosos/`, `scripts/_archivo/`
- Los umbrales de `test-orden` (salvo C10, que hay que **apretar**)
- `docs/historial/**`

## VALIDACIÓN — al cierre de CADA parte

```bash
rm -rf scripts/.tmp-*          # el criterio de verdad
npm run test:suites
node scripts/test-orden.mjs
node scripts/verificar-docs.mjs
npm run test:ci
npx tsc --noEmit
npm run lint
npm run build
```

`npm run lint` merece una mirada aparte: al quitar el ignore de `.tmp-*` debería
seguir en **0 errores**. Si aparecen, no son nuevos — son los que el ignore
tapaba, y hay que decir cuántos.

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-H-TS-NATIVO.md`:

### Antes / después
Líneas borradas, carpetas eliminadas, y el tiempo de `test:suites` antes y ahora.

### La suite piloto
El diff de `test-fechas.mjs` y su salida con la `.tmp` borrada.

### Sorpresas
Cualquier suite que necesitara algo más que cambiar la ruta, y qué supuesto
escondía. Si alguna reveló que el compilado y el fuente diferían, eso va primero.

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

> El punto 3 tiene una excepción **explícita y acotada a este prompt**: sí se
> borra `compilar-suites.mjs`, sus carpetas y sus enganches. No es legacy de
> producto, es andamio de una limitación de Node que ya no existe. Nada de
> `lib/` ni de `app/` se borra.
