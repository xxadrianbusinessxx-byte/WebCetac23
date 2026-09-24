# PROMPT CLINE — G-bis · El arranque ya tiene sitio: ahora que diga algo

## OBJETIVO — qué debe ser cierto al terminar

El PROMPT G construyó bien el **mecanismo**: `gen-invariantes` y `gen-rumbo`
derivan de su fuente, los dos `--check` salen con 1 de verdad (comprobado
corrompiendo cada archivo), los umbrales no se movieron y el ensayo no se tocó
de más. Eso se acepta entero y **no se rehace**.

Lo que no pasó la revisión es el **contenido**, y la culpa es del techo que te
dieron, no tuya: 9 500 estaba dimensionado para seis archivos y el prompt pidió
ocho. Tenías que elegir entre romper el CI y vaciar los documentos, y vaciaste,
que era lo correcto con las instrucciones que llevabas. Además **lo reportaste**
—tu punto 2— y esa era la señal.

**El techo ya subió a 10 500** (`scripts/verificar-docs.mjs`, decisión escrita en
su comentario). Hay ~1 000 tokens de margen. Este prompt los gasta en contenido.

Al terminar:

- Los 16 invariantes **obligan a algo**: cada uno se puede desobedecer, y la
  frase está tomada del cuerpo de su sección, no del título.
- «Qué cerró» de `RUMBO.md` dice qué cerró, y «lo que más pesa» se entiende sin
  abrir otro archivo.
- `Rama:` y `HEAD:` de `RUMBO.md` **se generan**. Hoy están a mano y no los
  verifica nadie.
- `node scripts/verificar-docs.mjs` en verde, por debajo de **10 500**.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto-cline.mjs --tarea=crear docs/normativo/ scripts/
```

Lee **solo** lo que salga de ahí, más `filosofia.estructural`, que es la fuente
que vas a trabajar. Nada más.

## MEDICIÓN INICIAL (pegada — no re-investigar)

`node scripts/verificar-docs.mjs`, tras subir el techo:

```
arranque         : 9,486 tokens (techo 10,500) en 8 archivos
                   docs/normativo/REGLAS_NO_HACER.md     2115 tok · 22%
                   docs/normativo/GLOSARIO.md            1946 tok · 21%
                   docs/00-INDICE.md                     1749 tok · 18%
                   ESTADO-ACTUAL.md                      1696 tok · 18%
                   AGENTS.md                             1291 tok · 14%
                   RUMBO.md                               299 tok ·  3%
                   docs/normativo/INVARIANTES.md          245 tok ·  3%
                   CLAUDE.md                              145 tok ·  2%
rutas muertas    : 0
```

**Presupuesto de este prompt, por pieza.** No tienes que adivinar cuánto cabe:

| Pieza | Hoy | Objetivo | Δ |
|---|---|---|---|
| `INVARIANTES.md` | 245 tok | **≤ 480** | +235 |
| `RUMBO.md` | 299 tok | **≤ 450** | +151 |
| **Arranque total** | 9 486 | **≤ 9 900** | +414 |

Quedarían ~600 de margen contra el techo. **Si te pasas de 9 900, recorta;
no toques `TECHO_TOKENS`** — ese número es decisión de arquitectura y ya se tomó
hoy (`AGENTS.md` §Qué nunca se delega).

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · Las 16 líneas `INVARIANTE:`, otra vez, con la frase que ya está escrita

**El fallo concreto, para que quede claro el listón.** El prompt G daba como
contraejemplo «Fuente única de verdad», porque nombra el tema y no obliga a
nada. Lo que quedó en §4 fue **`Un dato, una fuente.`** — el mismo
contraejemplo con otras palabras. Y la frase que sirve estaba tres líneas más
abajo, en el cuerpo de esa misma sección:

> Un módulo no debe crear una segunda fuente de verdad "porque es más fácil", ni
> inventar datos que pertenecen a otro módulo.

**Método, sección por sección.** Para cada una de las 16:

1. Lee el cuerpo y localiza **la oración que manda**. Suele estar en la cita
   `>` o en el primer párrafo tras el título. Si hay varias, la que más caro
   sale de desobedecer.
2. Cópiala, y **abrevia solo si no cabe en 120 caracteres**. Abreviar es quitar
   subordinadas, nunca el verbo ni el objeto.
3. Prueba a desobedecerla. Si no puedes escribir código que la viole, no es un
   invariante: vuelve al punto 1.

**Cuatro ya resueltas, para calibrar** (úsalas tal cual si te convencen):

| § | Antes (no sirve) | Ahora |
|---|---|---|
| §1 | `Se reemplaza sin tocar lo demás.` | `Un bloque se reemplaza, desactiva o evoluciona sin obligar a tocar código no relacionado.` |
| §4 | `Un dato, una fuente.` | `Ningún módulo crea una segunda fuente «porque es más fácil» ni inventa datos de otro módulo.` |
| §7 | `Se valida en el servidor, no en la UI.` | `Ocultar un botón no es autorización: toda escritura valida sesión, rol y alumno en el servidor.` |
| §13 | `Se apaga por flag; el flag no autoriza.` | `Un flag de desactivación no reemplaza la autorización: si el módulo escribe, la action valida.` |

Las 12 restantes las resuelves igual. Presta atención especial a:

- **§15** — hoy dice `Se verifica contra §2, §3, §4 y §7.`, que es circular: no
  obliga a nada, solo remite. Su cuerpo sí manda algo («antes de implementar,
  verificar el diseño contra…»). Si al final concluyes que §15 **no declara
  ningún invariante propio** —es una nota de aplicación, no una regla—, **dilo y
  déjalo fuera**: el generador debe permitir que una sección declare
  `INVARIANTE: —` y no aparecer en la tabla. Eso es un hallazgo legítimo, y
  forzar una frase vacía para cuadrar el 16 es peor que tener 15.
- **§16** — `Medir la capa del costo.` no se entiende fuera de contexto.
- **§2, §5, §12** — hoy son sintagmas nominales, sin verbo que obligue.

**1.1 — Subir el límite del generador.** `ANCHO_INVARIANTE` está en 100 en
`scripts/gen-invariantes.mjs` y §13 necesita 103. Súbelo a **120** y di en el
comentario por qué: el límite existe para que la línea siga siendo una línea, no
para comprimir la obligación hasta que desaparezca.

**1.2 — Una corrección acotada en el ensayo, ya que vas a estar dentro.** El
cuerpo de **§15** afirma que «contexto.feliz describe el estado» y que
«OPTIMIZACION describe decisiones de rendimiento». Las dos son falsas desde que
esos archivos pasaron a `docs/historial/`: el estado lo describe
`ESTADO-ACTUAL.md`. Corrige **solo esa enumeración**. Ni una línea más del
ensayo.

**PARA AQUÍ.** Corre `gen-invariantes --check` y `verificar-docs`, y reporta la
tabla de 16 (o 15) con el coste nuevo antes de seguir.

---

### Parte 2 · `RUMBO.md` — que informe

**2.1 — «Qué cerró».** Hoy los asuntos van a 20 caracteres y quedan así:

```
- 8d17188 · UIs pendientes: las…
```

Eso no dice qué cerró. Sube el corte a **72 caracteres** (el ancho del propio
documento) y quita el truncado si el asunto ya cabe. Diez commits a 72 son
~180 tokens, y están presupuestados.

**2.2 — «Lo que más pesa hoy».** Hoy sale `rotar-password-supabase — sin
verificar`: un `id` no dice qué es. Formato nuevo, por pendiente:

```
- <id> — <titulo> · `<verificar>`      (o «sin comando de verificación»)
```

El argumento de que copiar el `titulo` sería R6 **no se sostiene, y conviene que
quede claro porque es la regla central del repo**: R6 prohíbe una segunda fuente
*editable*, no una **proyección regenerable**. `RUMBO.md` es a
`pendientes.json` exactamente lo que `INVARIANTES.md` es a
`filosofia.estructural` — y si derivar desde la fuente fuera R6, la Parte 1 del
PROMPT G sería R6. Lo que R6 prohíbe es que alguien **edite** el título en
`RUMBO.md`; por eso vive dentro de los marcadores `GENERADO`, que es donde
editarlo a mano lo revierte el siguiente `gen-rumbo`.

**2.3 — `Rama:` y `HEAD:` bajan al bloque generado.** Están en la cabecera
manual y **nadie los verifica**: hoy coinciden porque se escribieron hoy. No son
decisiones, son hechos que `gen-rumbo` ya tiene —ya corre `git`—, así que su
sitio es el bloque generado. Es el mismo fallo que documentó
`docs/sistema/PENDIENTES-2026-09-16.md` §4 sobre `ESTADO-ACTUAL.md` cuando su
cabecera llegó a estar 31 commits atrás.

En la cabecera manual se quedan **solo decisiones**: `Campaña:`, `Se da por
terminada cuando:` y «Fuera de alcance ahora». Nada que un script pueda saber.

**PARA AQUÍ.** `gen-rumbo --check` y `verificar-docs`.

---

### Parte 3 · Que esto no vuelva a pasar

Un invariante que es el título de su sección **pasa los dos `--check` sin
problema**: son idénticos a su fuente, solo que su fuente no dice nada. El
mecanismo no distingue una frase que obliga de una etiqueta.

Añade a `gen-invariantes.mjs` un **ancho mínimo**, que falla igual que las
comprobaciones que ya tiene:

```js
const MINIMO_PALABRAS = 10;
```

No es una heurística elegante, pero está medida sobre los dos conjuntos reales
y separa sin un solo falso positivo:

| Conjunto | Palabras (mín / máx) |
|---|---|
| Las 16 frases que **no** sirven (las de hoy) | 4 / 9 |
| Las 4 frases reescritas de la Parte 1 | 14 / 16 |

**Por qué el ancho y no algo más listo.** Se probó la regla obvia —«la frase no
puede estar contenida en el título de su sección»— y **no atrapa el caso que
originó todo esto**: normalizado, `un dato una fuente` no está contenido en
`fuente unica de verdad` ni al revés, así que §4 habría pasado. La razón de
fondo es que una etiqueta y una obligación no se distinguen por las palabras que
comparten, sino por si hay sitio para un sujeto, un verbo y un objeto — y eso,
en español, son más de nueve palabras. Documenta este párrafo en el script: sin
él, el número 10 parece arbitrario y el primero que tropiece lo bajará.

Si al implementarlo encuentras una regla mejor **y la puedes medir contra las dos
listas de arriba**, ponla en su lugar y enseña la medición. Lo que no vale es
sustituirla por una que no hayas probado.

Este punto 3 es el que más vale del prompt: sin él, la próxima vez que el techo
apriete, los invariantes se vuelven a vaciar y los dos `--check` seguirán en
verde, porque una frase vacía es idéntica a su fuente — solo que su fuente no
dice nada.

---

## REGLAS

- **No rehagas el mecanismo.** Los dos scripts, los `--check`, los enganches al
  CI y a `AGENTS.md` están bien. Este prompt cambia **contenido** y añade dos
  guardas.
- Las frases salen del **cuerpo** del ensayo. No inventes doctrina: si la
  sección no lo dice, no es un invariante de esta casa.
- Nada de bajar ni subir umbrales: ni `TECHO_TOKENS`, ni C10 (está en 34), ni
  ninguna regla de `test-orden`.
- Si una pieza no cabe en su presupuesto, **recorta esa pieza y dilo**; no
  compenses quitando de la otra.

## LÍMITES — qué NO se toca

- `filosofia.estructural` más allá de las 16 líneas `INVARIANTE:` y la
  enumeración falsa de §15
- `ESTADO-ACTUAL.md`, `docs/historial/**`, `docs/sistema/MATRIZ-UX.md`
- cualquier cosa bajo `app/` o `lib/`
- `scripts/_peligrosos/`, `scripts/_archivo/`

## VALIDACIÓN — al cierre de CADA parte

```bash
node scripts/gen-invariantes.mjs --check
node scripts/gen-rumbo.mjs --check
node scripts/verificar-docs.mjs
node scripts/verificar-estado-actual.mjs
node scripts/test-orden.mjs
npm run test:ci
npx tsc --noEmit
npm run build
```

Y una prueba que **no** está en la lista y quiero ver en el informe: corrompe a
propósito un invariante para que sea otra vez el título de su sección, y enseña
que la guarda de la Parte 3 lo caza. Déjalo como estaba después.

## INFORME FINAL

En `docs/historial/informes/INFORME-PROMPT-G-BIS-CONTENIDO-DEL-ARRANQUE.md`:

### Las 16 (o 15) líneas
Tabla de tres columnas: **§ · antes · ahora**, y de qué línea del ensayo salió
cada frase nueva. Si alguna sección quedó sin invariante, su justificación.

### Coste
Antes/después por archivo, contra los presupuestos de la tabla de arriba.

### Las dos guardas
Qué heurística elegiste, por qué, y la salida de la prueba de corrupción.

### Validación
Los ocho comandos.

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

> El punto 2 aplica «en lo que aplique»: aquí no hay Server Actions ni base. Su
> equivalente es que **la frase vive en el ensayo y el script solo la lee**.
