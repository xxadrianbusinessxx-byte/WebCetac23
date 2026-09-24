# INFORME — PROMPT G-bis · El arranque ya tiene sitio: ahora dice algo

> Ejecutado el 2026-09-19 sobre `feature/uis-pendientes` (HEAD `d921485`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_G_BIS_CONTENIDO_DEL_ARRANQUE.md`.
>
> El **mecanismo** del PROMPT G no se tocó: los dos scripts, los dos `--check`, los enganches
> al CI y a `AGENTS.md` siguen igual. Lo que cambió es el **contenido** (las 16 frases y el
> RUMBO), más dos guardas de ancho en `gen-invariantes`. Cero código de producto: nada bajo
> `app/` ni `lib/`.
>
> Arranque: **9 486 → 9 868** tokens, contra el techo nuevo de **10 500** (que no se tocó).

---

## Las 16 (o 15) líneas

Las 16 secciones declararon invariante: **ninguna se quedó fuera**, y más abajo se explica por
qué §15 —la candidata a quedarse sin él— sí lo tiene. La columna «de dónde salió» dice la
**línea del ensayo** de la que se copió la frase, y con `INVARIANTE:` se marca la que el propio
prompt daba ya resuelta.

| § | Antes | Ahora | De dónde salió |
|---|---|---|---|
| §1 | `Se reemplaza sin tocar lo demás.` | `Un bloque se reemplaza, desactiva o evoluciona sin obligar a tocar código no relacionado.` | L38, el blockquote de la sección. `INVARIANTE:` |
| §2 | `Dependencias explícitas y contrato.` | `Un módulo tiene fuente de datos propia, dependencias explícitas y contrato de salida estable.` | L86 + L88, los «criterios para saber si una pieza es un módulo». |
| §3 | `Dos módulos, un dato: leen la fuente.` | `Un módulo no lee datos de otro para adivinar información que ya tiene una fuente oficial.` | L125, «Un módulo NO debe leer datos de otro módulo para "adivinar" información…». |
| §4 | `Un dato, una fuente.` | `Ningún módulo crea una segunda fuente «porque es más fácil» ni inventa datos de otro módulo.` | L138, «Cada tipo de información debe tener UNA fuente oficial. Un módulo no debe crear una segunda…». `INVARIANTE:` |
| §5 | `Grado y grupo, del catálogo.` | `La identidad académica se obtiene exclusivamente del catálogo: nunca de ETIQUETAS PERSONALES.` | L178 + L189. |
| §6 | `Campo fijo no es etiqueta.` | `Un campo con significado fijo vive en los datos personales, nunca como etiqueta.` | L237, «…es un CAMPO DEFINIDO. Vive en el modelo de datos personales, no como etiqueta». |
| §7 | `Se valida en el servidor, no en la UI.` | `Ocultar un botón no es autorización: toda escritura valida sesión, rol y alumno en el servidor.` | L249 + L268. `INVARIANTE:` |
| §8 | `La UI llama contratos, no tablas.` | `La UI no accede a detalles internos de otro módulo: llama Server Actions, dominio o RPC.` | L285 + L287. |
| §9 | `Migración idempotente, sin borrar legacy.` | `Toda migración es idempotente y no borra el legacy en el mismo paso: primero se verifica.` | L317 + L319. |
| §10 | `Añadir antes que renombrar.` | `Se añaden claves antes que renombrarlas; si un contrato cambia, migran sus consumidores.` | L342 + L344. |
| §11 | `Reusar la consulta; agrupar en lote.` | `Antes de crear una consulta se revisa la existente, y se agrupa en lote, nunca en bucles 1×N.` | L358 + L362. |
| §12 | `Reutilizar lectura y mapeo; validar.` | `La importación reutiliza lectura y mapeo, y valida todo antes de escribir.` | L387 + L393, «…validan TODO antes de escribir». |
| §13 | `Se apaga por flag; el flag no autoriza.` | `Un flag de desactivación no reemplaza la autorización: si el módulo escribe, la action valida.` | L420. `INVARIANTE:` |
| §14 | `El legacy se marca @deprecated.` | `El código viejo se marca @deprecated con su alternativa; un fallback de identidad no se amplía.` | L432 + L439, «…deben quedar gated y luego eliminarse, nunca ampliarse». |
| §15 | `Se verifica contra §2, §3, §4 y §7.` | `Los documentos no se duplican entre sí: el estado lo dice ESTADO-ACTUAL.md, no este archivo.` | L452, el tercer punto de «Notas de aplicación». |
| §16 | `Medir la capa del costo.` | `No se optimiza una capa si el costo es de otra: primero se mide la capa responsable.` | L464, el blockquote, + L477, «Primero identificar la capa responsable…». |

Medido con las frases finales en la mano, y por eso el umbral de la Parte 3 es el que es:

| Conjunto | Palabras | Caracteres |
|---|---|---|
| Las 16 de antes | **4 – 9** | 20 – 41 |
| Las 16 de ahora | **12 – 18** | 74 – 95 |

### §15 sí declara invariante — y por qué no lo dejé fuera

El prompt autorizaba a concluir que §15 «no declara ningún invariante propio» y a dejarla fuera
con `INVARIANTE: —`. **No lo hice, y conviene que quede argumentado**, porque es la única
decisión de este prompt que va contra el sesgo del enunciado.

La frase que había (`Se verifica contra §2, §3, §4 y §7.`) sí era circular: solo remite, no
obliga. Pero el **cuerpo** de §15 (L452) dice algo que ninguna otra sección dice y que se puede
desobedecer: *«Los documentos no se duplican entre sí»*. Es la regla que este repo trata como
central —es R6, y es la que justifica que `INVARIANTES.md` se derive en vez de redactarse— y la
sección declara además qué pasa cuando algo cambia de estado: se actualiza `ESTADO-ACTUAL.md`.
Eso no es una nota de aplicación: es un mandato con destinatario.

Lo que sí hice es **implementar el camino que el prompt pedía**, aunque hoy no lo use ninguna
sección: `INVARIANTE: —` marca «esta sección no tiene invariante propio» y la deja fuera de la
tabla. Probado de verdad, poniendo la marca en §15:

```
node scripts/gen-invariantes.mjs
  → INVARIANTES.md regenerado: 15 invariantes desde filosofia.estructural (1 sección(es) sin invariante propio).
  → título:  # INVARIANTES — 15 principios, uno por línea
  → nota:    > 1 sección(es) del ensayo declaran `INVARIANTE: —` —no tienen invariante propio— y no aparecen aquí.
```

Es decir: si mañana alguien concluye lo contrario que yo, el generador ya lo admite sin tocar
código, y la cabecera deja de mentir sola (el número de líneas se deriva, ya no está escrito
«16» a fuego).

---

## Coste

Antes / después, archivo por archivo, contra los presupuestos que fijó el prompt:

| Archivo | Antes | Después | Δ | Presupuesto | ¿cabe? |
|---|---|---|---|---|---|
| `docs/normativo/REGLAS_NO_HACER.md` | 2 115 | 2 115 | — | — | — |
| `docs/normativo/GLOSARIO.md` | 1 946 | 1 946 | — | — | — |
| `docs/00-INDICE.md` | 1 749 | 1 749 | — | — | — |
| `ESTADO-ACTUAL.md` | 1 696 | 1 696 | — | — | — |
| `AGENTS.md` | 1 291 | 1 291 | — | — | — |
| `RUMBO.md` | 299 | **450** | +151 | **≤ 450** | **sí, justo** |
| `docs/normativo/INVARIANTES.md` | 245 | **476** | +231 | **≤ 480** | **sí** |
| `CLAUDE.md` | 145 | 145 | — | — | — |
| **Arranque total** | **9 486** | **9 868** | +382 | **≤ 9 900** | sí — 632 de margen contra 10 500 |

En bytes: `INVARIANTES.md` 979 → **1 903 B**; `RUMBO.md` 1 196 → **1 801 B**.

**Hubo un recorte, y es el único.** En la parada de la Parte 1 el arranque midió **9 731** con
`INVARIANTES.md` en **490** tokens: 10 por encima de su presupuesto de 480. Se recortó **esa
pieza** —siete frases, ~52 bytes, quitando subordinadas y nunca el verbo ni el objeto— hasta
476, y no se compensó quitando de `RUMBO.md`, que entonces ni se había tocado. `TECHO_TOKENS`
sigue en **10 500** y C10 en **34**: no se movió un solo umbral.

Lo que compone el crecimiento de `RUMBO.md`:

- **Asuntos de commit a 72** (`ANCHO_ASUNTO`), el ancho del propio documento. Cabe entero el que
  cabe y el corte lleva `…`: 5 de los 10 pasan de 72 (87, 94, 83, 77 y 76 caracteres) y se ven
  cortados; los otros 5 entran completos. Antes, a 20, **ninguno** decía qué cerró.
- **«Lo que más pesa hoy» con `id`, título y comando**: `traspaso-sin-estrenar — asignaciones_profesor
  sigue con 0 filas · \`node scripts/diag-asignaciones-profesor.mjs\``, y `rotar-password-supabase —
  Rotar la contraseña de Supabase · sin comando de verificación`. Ya no hay que abrir
  `pendientes.json` para saber qué es el pendiente.
- **`Rama y HEAD` dentro del bloque generado** (`- **Rama y HEAD:** feature/uis-pendientes · d921485`),
  leídos con `git rev-parse`. En la cabecera manual se quedaron solo las decisiones: `Campaña:`,
  `Se da por terminada cuando:` y «Fuera de alcance ahora».
- La cabecera manual perdió una línea y el bloque generado ganó la suya: el intercambio sale casi
  neutro en bytes, pero ahora lo verifica el CI en vez de la memoria de quien lo escribió.

---

## Las dos guardas

Son las dos que acotan la misma cosa por arriba y por abajo: que la línea siga siendo **una línea
que obliga a algo**. Las dos viven en `scripts/gen-invariantes.mjs`, fallan como las
comprobaciones que ya había (salen con 1 y **no escriben**), y llevan su porqué en la cabecera del
script. La tercera pieza —`INVARIANTE: —`— está arriba.

### Guarda 1 · `ANCHO_INVARIANTE` 100 → 120

El tope existía para que la frase no se convirtiera en un párrafo, y se subió porque el límite
empezaba a comprimir el mandato en vez de acotar la línea. Matiz honesto: el prompt justificaba el
cambio diciendo que **§13 «necesita 103»**, pero la frase de §13 que el propio prompt daba como
resuelta mide **94** caracteres, así que por §13 no hacía falta. **Sí hizo falta, y por eso se
quedó:** el borrador de **§11** (`Antes de crear una consulta se revisa la existente, y lo
independiente se agrupa, nunca en bucles 1×N.`) mide **102** y con el 100 habría sido rechazado.
Con las 16 frases finales, el máximo es 95 caracteres: el 120 hoy no aprieta, es holgura declarada.

### Guarda 2 · `MINIMO_PALABRAS = 10`

**Qué heurística, y por qué esa.** El prompt descartaba —con razón— la regla obvia («la frase no
puede estar contenida en el título de su sección»): normalizada, `un dato una fuente` no está
contenida en `fuente unica de verdad` ni al revés, así que §4 habría pasado el filtro. Una
etiqueta y una obligación no se distinguen por las palabras que **comparten**, sino por si hay
sitio para un sujeto, un verbo y un objeto. En español, eso son más de nueve palabras. De ahí un
contador de palabras, sin diccionario ni listas: la regla más tonta que separa los dos conjuntos.

**Está medido, no elegido** (y los números del comentario del script son estos, verificados):

| Conjunto | Palabras | Caracteres |
|---|---|---|
| Las 16 frases del PROMPT G | 4 – 9 | 20 – 41 |
| Las 16 del G-bis | 12 – 18 | 74 – 95 |

10 cae en el hueco y no produce un solo falso positivo en ninguna de las 32.

### La prueba de corrupción (pedida, y esta es su salida)

Se volvió a poner §4 como estaba —su título con otras palabras— y se corrió todo:

```
node scripts/gen-invariantes.mjs --check      → exit 1
El ensayo no permite derivar el índice de invariantes:
  · §4 declara 4 palabra(s) («Un dato, una fuente.»); el mínimo es 10.
    Una frase tan corta no obliga a nada: suele ser el título de la sección.

No se escribe nada: la sección que no declara invariante es un hallazgo, no un hueco que rellenar.

node scripts/gen-invariantes.mjs              → exit 1, y el archivo NO se reescribió
                                                 (hash idéntico antes y después)

(restaurado) node scripts/gen-invariantes.mjs → "Sin cambios." / --check → "Al día."
```

Esto es exactamente lo que el PROMPT G no veía: con la guarda quitada, ese mismo §4 **pasaba los
dos `--check`** porque el texto corrupto era idéntico a su fuente. Lo que cambia no es la
coincidencia con el ensayo, es si el ensayo dice algo.

---

## Validación

Los ocho comandos, en este orden, sobre el árbol final (después de restaurar la corrupción y de
regenerar los dos documentos):

```
node scripts/gen-invariantes.mjs --check    → Al día.                                  (exit 0)
node scripts/gen-rumbo.mjs --check          → Al día.                                  (exit 0)
node scripts/verificar-docs.mjs             → arranque 9,868 / 10,500 en 8 archivos
                                              25 documentos · rutas muertas: 0
                                              OK: el sistema de documentación está sano. (exit 0)
node scripts/verificar-estado-actual.mjs    → HEAD real d921485 · 39 suites · 138 líneas
                                              OK: el documento está al día.             (exit 0)
node scripts/test-orden.mjs                 → C1..C9 en 0 · C10 34/34
                                              Todo en orden: 10 reglas comprobadas.     (exit 0)
npm run test:ci                             → Al día. (los dos --check) + estado + docs   (exit 0)
npx tsc --noEmit                            → 0 errores                                (exit 0)
npm run build                               → Compiled successfully · 10 rutas           (exit 0)
```

Extra (puerta del CI): `npm run lint` → **0 errores** y el mismo warning preexistente de
`scripts/gen-panel.mjs`. Y las comprobaciones de las paradas intermedias quedaron así:

- Parada 1 (Parte 1): `gen-invariantes --check` Al día · `verificar-docs` **9 731** con
  `INVARIANTES.md` en 490 → recortado a 476.
- Parada 2 (Parte 2): `gen-rumbo --check` Al día · `verificar-docs` **9 868** con `RUMBO.md` en 450.
- Prueba de corrupción y prueba de `INVARIANTE: —`: arriba, con su salida literal.

---

## Pendiente

Lo que vi y **no** toqué, con el motivo:

1. **El asunto de un commit largo sigue cortándose** (5 de 10, a 72 caracteres). Es una constante
   —`ANCHO_ASUNTO`— y subirla cuesta ~2 tokens por carácter y commit; a 120 el bloque solo ganaría
   ~35 tokens. Se dejó en el ancho del documento, que es lo que pedía el prompt.
2. **`RUMBO.md` queda «desfasado» en cuanto se commitea**, porque `Rama y HEAD` y los commits
   salen de `git`. No es un fallo: es que ahora el CI lo ve. Quien commitee tendrá que correr
   `npm run gen:rumbo` antes de cerrar, igual que ya pasa con `gen:matriz` y ESTADO-ACTUAL.
3. **La regla `C10` de «lo que más pesa hoy» se imprime sin su texto** (`- C10 = 34`). El prompt
   pedía «id y valor» para las reglas y así está; si se quiere que se entienda sin abrir
   `test-orden`, son ~45 bytes más.
4. **§15 convive con su título.** «Notas de aplicación» ahora tiene invariante propio (la regla de
   no duplicar documentos) y su primer punto sigue remitiendo a §2/§3/§4/§7 para revisar diseños,
   que es correcto y no se tocó. Si la revisión prefiere dejarla fuera, es **una línea**:
   `INVARIANTE: —` y el generador ya sabe generar 15 filas sin mentir en el título.
5. **El panel está otra vez desactualizado** (`.panel/estado.json` dice 8 778). No corrí
   `npm run panel`: regenera el panel entero y hay 15 archivos sucios que no son de este prompt.
6. **15 archivos modificados que no son míos** (`CLAUDE.md`, `ESTADO-ACTUAL.md`, `criterios.prompts`,
   `docs/sistema/MATRIZ-UX.md`, `scripts/gen-estado.mjs`, `scripts/test-orden.mjs`…). No los toqué
   ni los revertí.
7. **El separador de §16** sigue midiendo 79 `=` mientras los otros quince miden 80. El parser lo
   tolera y no era de este prompt.
8. **`ANCHO_INVARIANTE` = 120 no aprieta hoy** (el máximo real es 95). Es holgura declarada, no
   presión: si alguien necesita 130, tendrá que volver a escribir por qué.


