# PROMPT CLINE — G · La filosofía entra en el arranque, y el repo declara su rumbo

## OBJETIVO — qué debe ser cierto al terminar

Hoy un agente que arranca este repo sabe **qué es verdad** (`ESTADO-ACTUAL.md`) y
**qué está prohibido** (`REGLAS_NO_HACER.md`). Le faltan dos cosas, y las dos cuestan
caro cada sesión:

1. **La filosofía no está en el arranque.** `AGENTS.md` pone `filosofia.estructural`
   en la autoridad **#2**, por encima de las reglas de no hacer — y sin embargo no
   se lee al arrancar, porque son 19 KB de ensayo (16 secciones). El resultado es que
   la autoridad #2 del repo no la aplica nadie salvo cuando alguien la abre a mano.
2. **No hay rumbo.** Hay estado (hoy) e historial (el pasado), y nada en medio. Un
   agente no sabe que está en mitad de una campaña, ni qué se acaba de cerrar, ni
   qué está fuera de alcance ahora mismo. Eso se reconstruye leyendo los 30 KB de
   `docs/historial/BITACORA-2026-09.md`, que es exactamente el gasto que
   `docs/00-INDICE.md` existe para evitar.

Al terminar:

- `docs/normativo/INVARIANTES.md` existe: los 16 principios de
  `filosofia.estructural`, **una línea cada uno**, y está en la lectura de arranque.
- `RUMBO.md` existe: qué campaña está abierta, qué cerró, qué sigue y qué **no** se
  toca ahora; y está en la lectura de arranque.
- **Ninguno de los dos se escribe a mano dos veces.** Los dos se generan desde su
  fuente y los dos tienen `--check` en el CI, igual que `gen:matriz -- --check`.
- `node scripts/verificar-docs.mjs` sigue en verde: **rutas vivas 0** y el arranque
  **por debajo de 9 500 tokens** con los dos archivos nuevos dentro.

## ANTES DE NADA — genera tu propio contexto

No leas el repo. Corre esto y lee **solo** lo que salga:

```bash
node scripts/gen-contexto-cline.mjs --tarea=crear docs/normativo/ scripts/
```

Te devuelve el presupuesto de lectura, la capa de cada destino y lo que esa capa
exige, y el bloque CONTRATO §1. **No cargues nada fuera de esa lista.**

## MEDICIÓN INICIAL (pegada — no re-investigar)

`node scripts/verificar-docs.mjs`, 2026-09-19:

```
arranque         : 8,859 tokens (techo 9,500) en 6 archivos
                   docs/normativo/REGLAS_NO_HACER.md     2115 tok · 24%
                   docs/normativo/GLOSARIO.md            1946 tok · 22%
                   ESTADO-ACTUAL.md                      1696 tok · 19%
                   docs/00-INDICE.md                     1695 tok · 19%
                   AGENTS.md                             1262 tok · 14%
                   CLAUDE.md                              145 tok ·  2%
documentos       : 23 revisados (docs/historial/ no se escanea)
rutas muertas    : 0
```

**El margen es 641 tokens** (9 500 − 8 859). Los dos archivos nuevos **caben ahí**:
INVARIANTES ~250 tokens (16 líneas + cabecera), RUMBO ~350. Si al terminar el techo
se rompe, **el error es que escribiste de más**, no que el techo sea bajo: recorta.
No lo subas — subirlo es una decisión de arquitectura y no es tuya (`AGENTS.md`
§Qué nunca se delega).

Las 16 secciones de `filosofia.estructural`, por si acaso (`grep -nE "^[0-9]+\. "`):

```
1 PRINCIPIO CENTRAL — ARQUITECTURA MODULAR    9  MIGRACIONES SEGURAS
2 MODULARIDAD                                 10 COMPATIBILIDAD (CAMBIOS ADITIVOS)
3 BAJO ACOPLAMIENTO                           11 RENDIMIENTO
4 FUENTE ÚNICA DE VERDAD                      12 IMPORTACIONES
5 SEPARACIÓN ACADÉMICO / PERSONAL             13 DESACTIVACIÓN DE MÓDULOS
6 CAMPOS DEFINIDOS / ETIQUETAS DINÁMICAS      14 LEGACY
7 SEGURIDAD POR SERVIDOR                      15 NOTAS DE APLICACIÓN
8 CONTRATOS ENTRE MÓDULOS                     16 OPTIMIZACIÓN POR CAPAS
```

---

## SECUENCIA — dos partes, con parada entre ellas

### Parte 1 · `INVARIANTES.md`, derivado de `filosofia.estructural`

**El problema que hay que evitar, primero.** Escribir a mano un resumen de los 16
principios crea una **segunda fuente** de la filosofía. A la primera vez que alguien
matice el ensayo, el resumen —que es el que se lee al arrancar— miente. Eso es
literalmente la R6 que el repo prohíbe, aplicada a su propia normativa.

Así que el resumen **se deriva**, no se redacta:

**1.1 — Marcar la fuente.** En `filosofia.estructural`, dentro de cada una de las 16
secciones, añade **una sola línea** con esta forma exacta, inmediatamente después de
la línea de título de la sección:

```
INVARIANTE: <una frase imperativa, ≤ 100 caracteres, que se pueda desobedecer>
```

Reglas de esa frase:

- Es lo que hay que **hacer o no hacer**, no un tema. «Una sola fuente por concepto:
  si hay dos, una es legado y se declara» sirve. «Fuente única de verdad» no sirve —
  nombra el tema y no obliga a nada.
- No inventes doctrina nueva: la frase tiene que estar **ya dicha** en el cuerpo de
  esa sección. Si no la encuentras, **para y repórtalo**: significa que esa sección
  no declara ningún invariante, y eso es un hallazgo, no algo que rellenar.
- No toques ni una línea más del ensayo. Su contenido no se edita en este prompt.

**1.2 — `scripts/gen-invariantes.mjs`.** Lee `filosofia.estructural`, extrae las 16
parejas (número + título + `INVARIANTE:`) y escribe `docs/normativo/INVARIANTES.md`:
una tabla de 16 filas —número, invariante, y la sección del ensayo donde está
argumentado— con una cabecera de 3 o 4 líneas que diga qué es el archivo, que es
**generado**, y que para el porqué de cada uno se va al ensayo.

Cabecera del script con qué mide / qué escribe / cómo se ejecuta, y **fila en
`scripts/README.md`** (`test-orden` C10 lo exige, y su umbral está en 34: no lo subas).

Modos: sin argumentos escribe el archivo; `--check` **no escribe** y sale con 1 si lo
que hay en disco no coincide con lo que se generaría. Es el mismo contrato que
`gen-matriz-permisos.mjs --check`; míralo antes de inventar otro.

**1.3 — Ponerlo en el arranque.** En `AGENTS.md` §«Lectura de arranque», añade
`docs/normativo/INVARIANTES.md` como punto 3 (después de REGLAS_NO_HACER, antes del
GLOSARIO) con media línea de por qué. Añádelo también al array `ARRANQUE` de
`scripts/verificar-docs.mjs` y a la tabla de `docs/00-INDICE.md`.

En `docs/00-INDICE.md`, la fila «Decidir arquitectura (nuevo módulo, nueva tabla)»
debe seguir mandando a `filosofia.estructural`: el ensayo no se sustituye, se
**indexa**. Di eso explícitamente en la cabecera de INVARIANTES.

**PARA AQUÍ.** Corre `node scripts/verificar-docs.mjs` y `node scripts/test-orden.mjs`
y reporta el nuevo coste de arranque antes de seguir.

---

### Parte 2 · `RUMBO.md` — la capa que falta

**Qué es y qué no es.** No es un plan, ni un backlog, ni una bitácora. Responde una
sola pregunta, en menos de 40 líneas: **«si entro hoy en este repo, ¿en medio de qué
estoy?»**. Lo que no responda eso, sobra.

Estructura fija, y **cabe en ~350 tokens**:

```markdown
# RUMBO — en medio de qué estamos

- **Campaña:** <una línea>
- **Rama:** <rama> · **HEAD:** <sha corto>
- **Se da por terminada cuando:** <una línea, comprobable>

## Fuera de alcance ahora
<3 a 5 viñetas: lo que NO se toca durante esta campaña, y por qué>

<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
## Qué cerró (últimos 10 commits)
...
## Lo que más pesa hoy
...
<!-- FIN GENERADO -->
```

La cabecera y «Fuera de alcance» **se escriben a mano**: son decisiones, y ningún
script las puede adivinar. Lo de dentro de los marcadores lo genera
`scripts/gen-rumbo.mjs` desde lo que **ya se mide**, sin volver a medir nada:

- «Qué cerró»: `git log -10 --format=%h · %s`.
- «Lo que más pesa hoy»: los pendientes `estado: abierto` y `riesgo: alto` de
  `docs/sistema/pendientes.json` —id, título y su comando `verificar`— y las reglas
  de `node scripts/test-orden.mjs --json` que **no** estén en 0, con su valor.

Nada de eso se recalcula dentro de `gen-rumbo.mjs`: se lee de su fuente. Si te
descubres contando archivos o parseando `app/`, has creado una segunda fuente (R6) y
vas por mal camino.

Mismos dos modos que la Parte 1: sin argumentos reescribe **solo** el bloque entre
marcadores y deja intacto lo de arriba; `--check` sale con 1 si el bloque está
desfasado. Cabecera completa y fila en `scripts/README.md`.

**2.1 — Contenido inicial.** Rellena la parte manual con lo que es verdad hoy:
la campaña es la rama `feature/uis-pendientes`; «fuera de alcance» sale de los
pendientes marcados `quien: persona` de `docs/sistema/pendientes.json` —no los
copies, **resúmelos**: son operación, no código, y ningún agente puede cerrarlos.

**2.2 — Enganches.** `RUMBO.md` entra en: la lectura de arranque de `AGENTS.md`
(punto 2, justo después de `ESTADO-ACTUAL.md`), el array `ARRANQUE` de
`verificar-docs.mjs`, la tabla de raíz de `docs/00-INDICE.md`, y el CI como un paso
más junto a `verificar:docs`. Añade los dos `--check` a `npm run test:ci`.

---

## REGLAS

- **Nada se escribe dos veces.** Si un dato ya vive en un JSON, un script o un
  documento, se **lee**. Cada copia que hagas se desincroniza el día que alguien
  toque el original, y el que miente es el resumen — que es justo el que se lee al
  arrancar.
- **Los dos archivos nuevos son de solo-escritura-por-script** salvo la parte manual
  declarada de `RUMBO.md`. Dilo dentro del propio archivo, en la primera línea.
- El ensayo `filosofia.estructural` **no se edita** más allá de las 16 líneas
  `INVARIANTE:`. Ni se recorta, ni se reordena, ni se mueve a `docs/`.
- No bajes ni subas ningún umbral: ni el techo de tokens, ni C10, ni ninguna regla
  de `test-orden`.

## LÍMITES — qué NO se toca

- `ESTADO-ACTUAL.md` (su contenido; solo se le añade el enlace a RUMBO si hace falta)
- `docs/historial/**` — es el pasado, no se reescribe
- `docs/sistema/MATRIZ-UX.md` — tiene su propio pendiente abierto
  (`matriz-ux-anterior-al-shell`) y **no es este prompt**
- cualquier cosa bajo `app/` o `lib/`: este prompt **no toca código de producto**
- `scripts/_peligrosos/`, `scripts/_archivo/`

## VALIDACIÓN — al cierre de CADA parte

```bash
node scripts/gen-invariantes.mjs --check    # Parte 1
node scripts/gen-rumbo.mjs --check          # Parte 2
node scripts/verificar-docs.mjs             # rutas vivas + techo de arranque
node scripts/verificar-estado-actual.mjs
node scripts/test-orden.mjs
npm run test:ci
npx tsc --noEmit
npm run build
```

El que manda es `verificar-docs`: si el arranque pasa de 9 500, **recorta los dos
archivos nuevos** hasta que quepan.

## INFORME FINAL

En `docs/historial/informes/INFORME-PROMPT-G-INVARIANTES-Y-RUMBO.md`:

### Implementado
Qué archivos nuevos, qué scripts, qué enganches.

### Las 16 líneas `INVARIANTE:`
La tabla completa tal y como quedó, y **de qué párrafo del ensayo salió cada una**.
Si alguna sección no declaraba ningún invariante, dilo aquí: es el hallazgo más
valioso de este prompt.

### Coste de arranque
Antes / después, archivo por archivo, y cuánto margen queda contra el techo.

### Validación
La salida de los ocho comandos.

### Pendiente
Lo que viste y no tocaste.

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

> El punto 2 del CONTRATO aplica «en lo que aplique»: este prompt no crea Server
> Actions ni toca la base. Su equivalente aquí es que **la decisión vive en la
> fuente y el script solo la lee**.
