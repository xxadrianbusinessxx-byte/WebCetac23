# INFORME — PROMPT G · La filosofía entra en el arranque, y el repo declara su rumbo

> Ejecutado el 2026-09-19 sobre `feature/uis-pendientes` (HEAD `d921485`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_G_INVARIANTES_Y_RUMBO.md`.
>
> **Cero cambios de comportamiento y cero código de producto:** no se tocó nada bajo `app/`
> ni `lib/`. Todo lo que se movió son documentos, dos scripts de `LEE(fs)` y sus enganches.
> El arranque pasó de **8 859 a 9 486 tokens** con el techo **intacto en 9 500**.

---

## Implementado

### Parte 1 · `INVARIANTES.md`, derivado de `filosofia.estructural`

**1.1 — La fuente se marca, no se resume.** En el ensayo se añadieron **16 líneas
`INVARIANTE:`**, una por sección, inmediatamente después de la línea de título. Es el único
cambio que sufre `filosofia.estructural`: no se recortó, ni se reordenó, ni se movió nada más
(el ensayo sigue en la raíz, donde C7 de `test-orden` ni lo mira porque solo vigila código).

| Sección del ensayo | Línea añadida |
|---|---|
| §1 PRINCIPIO CENTRAL | `INVARIANTE: Se reemplaza sin tocar lo demás.` |
| §2 MODULARIDAD | `INVARIANTE: Dependencias explícitas y contrato.` |
| §3 BAJO ACOPLAMIENTO | `INVARIANTE: Dos módulos, un dato: leen la fuente.` |
| §4 FUENTE ÚNICA DE VERDAD | `INVARIANTE: Un dato, una fuente.` |
| §5 ACADÉMICO / PERSONAL | `INVARIANTE: Grado y grupo, del catálogo.` |
| §6 CAMPOS / ETIQUETAS | `INVARIANTE: Campo fijo no es etiqueta.` |
| §7 SEGURIDAD POR SERVIDOR | `INVARIANTE: Se valida en el servidor, no en la UI.` |
| §8 CONTRATOS ENTRE MÓDULOS | `INVARIANTE: La UI llama contratos, no tablas.` |
| §9 MIGRACIONES SEGURAS | `INVARIANTE: Migración idempotente, sin borrar legacy.` |
| §10 COMPATIBILIDAD | `INVARIANTE: Añadir antes que renombrar.` |
| §11 RENDIMIENTO | `INVARIANTE: Reusar la consulta; agrupar en lote.` |
| §12 IMPORTACIONES | `INVARIANTE: Reutilizar lectura y mapeo; validar.` |
| §13 DESACTIVACIÓN DE MÓDULOS | `INVARIANTE: Se apaga por flag; el flag no autoriza.` |
| §14 LEGACY | `INVARIANTE: El legacy se marca @deprecated.` |
| §15 NOTAS DE APLICACIÓN | `INVARIANTE: Se verifica contra §2, §3, §4 y §7.` |
| §16 OPTIMIZACIÓN POR CAPAS | `INVARIANTE: Medir la capa del costo.` |

**1.2 — `scripts/gen-invariantes.mjs`** (nuevo, `LEE(fs)`). Localiza cada sección por su
título entre las dos líneas de `=` y toma la **primera línea no vacía** que le sigue: si no
empieza por `INVARIANTE:`, esa sección no declara invariante y el script **para sin escribir
nada** y la reporta. También falla si el ensayo deja de tener 16 secciones o si una frase pasa
de 100 caracteres. Modos: sin argumentos escribe `docs/normativo/INVARIANTES.md`; `--check` no
escribe y sale 1 si hay desfase — mismo contrato que `gen-matriz-permisos.mjs --check`, del que
se copió la forma (comparación del texto normalizado a LF, porque el repo mezcla finales de
línea).

**1.3 — En el arranque.** `AGENTS.md` §«Lectura de arranque» pasa a 6 puntos; `INVARIANTES.md`
es el **4**, justo después de `REGLAS_NO_HACER.md` y antes del `GLOSARIO`. También entró en el
array `ARRANQUE` de `verificar-docs.mjs`, en la tabla de `docs/normativo/` de `00-INDICE.md`,
en el presupuesto «Cualquier cambio» y en el CI. La fila «Decidir arquitectura (nuevo módulo,
nueva tabla)» de `00-INDICE.md` **sigue mandando a `filosofia.estructural`**, y la cabecera de
`INVARIANTES.md` lo dice explícitamente: el ensayo no se sustituye, se **indexa**.

### Parte 2 · `RUMBO.md` — la capa que falta

`RUMBO.md` (raíz, 1 196 B) responde una sola pregunta: *si entro hoy, ¿en medio de qué estoy?*
La cabecera y «Fuera de alcance ahora» se escriben a mano; el resto lo reescribe el script
entre sus dos marcadores:

```markdown
<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
## Qué cerró (últimos 10 commits)   ·   ## Lo que más pesa hoy
<!-- FIN GENERADO -->
```

**2.1 — Contenido inicial.** La campaña es `feature/uis-pendientes` = cerrar las UIs pendientes
del rediseño Océano, y se da por terminada cuando las seis pantallas operan y el CI está en
verde. «Fuera de alcance» **resume** los pendientes `quien: persona` de
`docs/sistema/pendientes.json` (operación de persona: asignaciones y claves; `MATRIZ-UX.md`, que
tiene su propio pendiente abierto; y el legacy/fallbacks de R8). No los copia: son operación, no
código, y ningún agente los cierra.

**2.2 — `scripts/gen-rumbo.mjs`** (nuevo, `LEE(fs)`). **No mide nada**: lee `git log -10
--format=%h · %s`, los pendientes `estado: abierto` + `riesgo: alto` de `pendientes.json` y las
reglas de `test-orden --json` que **no** están en 0 (hoy `C10 = 34`). Sin argumentos reescribe
**solo** el bloque entre marcadores y deja intacto lo de arriba; `--check` sale 1 si el bloque
está desfasado. Dos detalles de implementación que costaron una iteración:

- `git` y `test-orden` se invocan con `execFileSync` (sin shell) porque el `·` del formato se lo
  comía `cmd.exe` en Windows.
- El `test-orden --json` se lee **del `stdout` de un error** cuando sale 1. Ese es precisamente
  el caso que hay que contar —una regla que sube— y sin esa tolerancia el generador se caía en
  vez de reportar el `C10 = 36` transitorio que provocan sus propios archivos nuevos.

**2.3 — Enganches.** `AGENTS.md` (punto **2**, justo después de `ESTADO-ACTUAL.md`), array
`ARRANQUE`, tabla de raíz de `00-INDICE.md`, presupuesto «Cualquier cambio», CI (dos pasos
nuevos junto a `verificar:docs`) y `npm run test:ci`.

### Enganches, archivo por archivo

| Archivo | Cambio | Por qué |
|---|---|---|
| `filosofia.estructural` | +16 líneas `INVARIANTE:` | es la fuente; es lo único que se le añade |
| `scripts/gen-invariantes.mjs` | **nuevo** | deriva el índice; `--check` |
| `docs/normativo/INVARIANTES.md` | **nuevo (generado)** | los 16 principios, uno por línea |
| `scripts/gen-rumbo.mjs` | **nuevo** | reescribe el bloque generado de `RUMBO.md`; `--check` |
| `RUMBO.md` | **nuevo** | campaña, fuera de alcance, cierre y peso de hoy |
| `AGENTS.md` | arranque a 6 puntos; `~35 KB` → `~37 KB` | los dos archivos nuevos son arranque |
| `docs/00-INDICE.md` | fila de `RUMBO.md` (raíz), fila de `INVARIANTES.md` (`normativo/`) y presupuesto | descubribilidad y paquete de contexto |
| `scripts/verificar-docs.mjs` | `ARRANQUE` +2, `CORPUS` +`RUMBO.md`, comentario del techo | medir el arranque **y** verificar sus rutas |
| `scripts/README.md` | fila de cada script nuevo | `test-orden` C10 lo exige (34 sigue en 34) |
| `package.json` | `gen:invariantes`, `gen:rumbo` y los dos `--check` en `test:ci` | mismo contrato que `gen:matriz` |
| `.github/workflows/verificacion.yml` | dos pasos junto a `verificar:docs` | sin CI, un documento se desincroniza solo |

**`RUMBO.md` entró también en `CORPUS`** (la lista de documentos del presente cuyas rutas cita
`verificar-docs`). El prompt no lo pedía —solo pedía el array `ARRANQUE`—, pero un archivo que
entra en el arranque y cita rutas debe tener sus rutas verificadas: es una línea y es
aditivo. `INVARIANTES.md` entró solo, porque `CORPUS` recorre `docs/normativo/*.md` por glob.

---

## Las 16 líneas `INVARIANTE:`

Tal y como quedaron (las 16 frases caben enteras en `docs/normativo/INVARIANTES.md`, que es lo
que se lee al arrancar), y **de qué párrafo del ensayo salió cada una**. Ninguna es doctrina
nueva: todas están ya dichas en el cuerpo de su sección.

| § | Invariante | De qué párrafo del ensayo salió |
|---|---|---|
| §1 | Se reemplaza sin tocar lo demás. | El blockquote: «Un bloque de funcionalidad debe poder reemplazarse, desactivarse, modificarse o evolucionar sin obligar a modificar grandes cantidades de código no relacionado». |
| §2 | Dependencias explícitas y contrato. | Los «Criterios para saber si una pieza es un módulo»: «Sus dependencias son explícitas (imports) y no implícitas» + «Tiene un contrato de salida estable (funciones, tipos, acciones)». |
| §3 | Dos módulos, un dato: leen la fuente. | «Si dos módulos necesitan el mismo dato, ambos consultan la FUENTE ÚNICA, no uno al otro». |
| §4 | Un dato, una fuente. | «Cada tipo de información debe tener UNA fuente oficial» + «Si un dato ya está en una fuente oficial, NINGÚN otro módulo debe re-derivarlo». |
| §5 | Grado y grupo, del catálogo. | «La información académica se obtiene EXCLUSIVAMENTE del catálogo académico» + «Identidad académica → catálogo académico». |
| §6 | Campo fijo no es etiqueta. | «Un campo con significado fijo (edad, teléfono, correo…) es un CAMPO DEFINIDO. Vive en el modelo de datos personales, no como etiqueta». |
| §7 | Se valida en el servidor, no en la UI. | «Ocultar un botón NO es autorización… la seguridad se valida SIEMPRE en el servidor» + «Los permisos de escritura se comprueban en la función server antes de tocar la base de datos». |
| §8 | La UI llama contratos, no tablas. | «Los componentes "use client" llaman Server Actions o funciones puras de dominio…, nunca escriben SQL ni conocen tablas internas de otros módulos salvo a través del contrato». |
| §9 | Migración idempotente, sin borrar legacy. | «Las migraciones de datos deben ser idempotentes o tener protección contra ejecución repetida» + «NO borran columnas/tablas legacy en el mismo paso: primero se verifica el destino». |
| §10 | Añadir antes que renombrar. | «Añadir claves nuevas a un payload es preferible a renombrar/eliminar claves existentes». |
| §11 | Reusar la consulta; agrupar en lote. | «Antes de crear una consulta nueva, revisar si la información ya está disponible» + «Preferir consultas por lote (.in(), jsonb_agg en RPC) antes que bucles 1×N de queries». |
| §12 | Reutilizar lectura y mapeo; validar. | «La lógica de importación debe ser REUTILIZABLE y compartida» + «Las importaciones que escriben en varios alumnos validan TODO antes de escribir». |
| §13 | Se apaga por flag; el flag no autoriza. | «Un módulo debe poder desactivarse mediante configuración / feature flag SIN eliminar físicamente todo su código» + «Un flag de desactivación NO reemplaza la autorización (§7)». |
| §14 | El legacy se marca @deprecated. | «El código viejo se marca con @deprecated en la firma y un comentario que indique la alternativa». |
| §15 | Se verifica contra §2, §3, §4 y §7. | «Antes de implementar, verificar contra §2 (modularidad), §3 (acoplamiento), §4 (fuente única) y §7 (seguridad)». |
| §16 | Medir la capa del costo. | El blockquote: «No optimizar una capa si el costo del problema pertenece a otra capa», y la primera regla de aplicación: «Primero identificar la capa responsable del problema (medición), después optimizar esa capa». |

### Hallazgo: las 16 secciones declaraban invariante — ninguna hubo que reportar

El prompt pedía parar y reportar si alguna sección **no** declaraba ningún invariante, y avisaba
de que ese sería el hallazgo más valioso. **No hubo ninguno:** las 16 secciones del ensayo son
reglas operativas («evitar dependencias cruzadas», «no eliminar legacy inmediatamente»), no
temas de discusión, así que en las 16 hay una frase que ya obliga a hacer o no hacer algo. El
hallazgo es, entonces, el contrario y también es útil: **`filosofia.estructural` es un ensayo
enteramente normativo**, y por eso se puede derivar de él sin inventar nada — y por eso también
era caro no leerlo al arrancar.

### Hallazgo 2: el techo obliga a recortar las frases a ~30–45 caracteres

El prompt estimaba `INVARIANTES ~250 tok` + `RUMBO ~350 tok` dentro de los **641** de margen.
La aritmética real, medida al terminar cada iteración:

- Los dos archivos nuevos **no son los únicos** que crecen: `AGENTS.md` (+29 tok, las dos líneas
  de arranque) y `docs/00-INDICE.md` (+54 tok, dos filas y el presupuesto) también están **dentro**
  del arranque y lo pagan. Margen real para los dos documentos: **~553 tokens**, no 641.
- Con frases de calidad (70–90 caracteres, como el ejemplo del propio prompt) el arranque se iba
  a **9 712**. Hubo tres pasadas de recorte hasta 9 486.
- Consecuencia: las 16 frases quedaron en **~30–45 caracteres** en vez de los ~100 que permite el
  formato. Siguen siendo imperativas y desobedecibles («Un dato, una fuente.», «Se apaga por
  flag; el flag no autoriza.»), pero **no** el resumen de una frase con matiz que permite el
  techo de 100 caracteres. Lo mismo en `RUMBO.md`: los asuntos de commit se recortan a 20
  caracteres y los títulos de los pendientes **no** se copian (el `id` y el comando sí).
  Y la cabecera de `INVARIANTES.md` se quedó en dos líneas: dice qué es, que está generado, que
  el § remite al ensayo y que `00-INDICE.md` sigue mandando allí, pero sin explicar el porqué de
  cada principio — que es justo lo que el archivo no puede permitirse.

---

## Coste de arranque

Antes / después, archivo por archivo. La unidad es la que usa `verificar-docs.mjs` (~4 bytes por
token), y el orden es el de su salida (por tamaño):

| Archivo | Antes | Después | Δ |
|---|---|---|---|
| `docs/normativo/REGLAS_NO_HACER.md` | 2 115 | 2 115 | — |
| `docs/normativo/GLOSARIO.md` | 1 946 | 1 946 | — |
| `docs/00-INDICE.md` | 1 695 | **1 749** | **+54** (dos filas + el presupuesto) |
| `ESTADO-ACTUAL.md` | 1 696 | 1 696 | — |
| `AGENTS.md` | 1 262 | **1 291** | **+29** (los dos puntos nuevos) |
| `RUMBO.md` | — | **299** | **+299** (1 196 B) |
| `docs/normativo/INVARIANTES.md` | — | **245** | **+245** (979 B) |
| `CLAUDE.md` | 145 | 145 | — |
| **Arranque** | **8 859** (6 archivos) | **9 486** (8 archivos) | **+627** |
| **Margen contra el techo** | 641 | **14** | −627 |

Techo: **9 500, sin tocar**. No se subió ni se bajó ningún umbral, y no se tocó ningún archivo
que ya estuviera en el arranque salvo `AGENTS.md` y `00-INDICE.md`, que **declaran** lo que
entra (si no lo dijeran, el arranque medido y el documentado divergirían).

Documentos revisados por `verificar-docs`: **23 → 25** (los dos nuevos), y **rutas muertas: 0**.

---

## Validación

Los ocho comandos del prompt, en este orden, sobre el árbol final:

```
node scripts/gen-invariantes.mjs --check    → Al día.                                  (exit 0)
node scripts/gen-rumbo.mjs --check          → Al día.                                  (exit 0)
node scripts/verificar-docs.mjs             → arranque 9,486 / 9,500 en 8 archivos
                                              25 documentos · rutas muertas: 0
                                              OK: el sistema de documentación está sano. (exit 0)
node scripts/verificar-estado-actual.mjs    → HEAD real d921485 · 39 suites · 138 líneas
                                              OK: el documento está al día.             (exit 0)
node scripts/test-orden.mjs                 → C1..C9 en 0 · C10 34/34
                                              Todo en orden: 10 reglas comprobadas.     (exit 0)
npm run test:ci                             → suites + gen-invariantes --check
                                              + gen-rumbo --check + verificar:estado
                                              + verificar:docs                          (exit 0)
npx tsc --noEmit                            → 0 errores                                (exit 0)
npm run build                               → 10 rutas                                  (exit 0)
```

Extra (el CI lo corre en cada push, así que cuenta como puerta): `npm run lint` → **0 errores**
y 1 warning preexistente en `scripts/gen-panel.mjs` (el prompt F lo dejó documentado y este
prompt no lo toca).

Comprobaciones hechas **antes** de dar nada por bueno, además de las ocho:

- `test-orden` C10 pasó por 36 y volvió a 34: los dos scripts nuevos empujaron el trinquete
  porque aún no tenían fila en `scripts/README.md`. Se les dio fila (era obligación del prompt)
  y el guardián volvió a su umbral **sin bajarlo**.
- `verificar-docs` falló dos veces por techo (9 712 → 9 616 → 9 569) y una tercera por llegar a
  9 492 con solo 8 tokens de margen: se siguió recortando hasta 9 486. Nunca se tocó el techo.
- `gen-rumbo.mjs` se probó además contra un `test-orden` en **fallo** (el `C10 = 36` de arriba):
  el bloque dice la verdad, no se cae.

---

## Pendiente

Lo que vi y **no** toqué, con el motivo:

1. **`ESTADO-ACTUAL.md` sin enlace a `RUMBO.md`.** El prompt lo permitía «si hace falta». No hace
   falta: el arranque de `AGENTS.md` pone `RUMBO.md` justo detrás, y añadir una línea habría
   gastado margen en un archivo cuyo contenido este prompt no debe tocar.
2. **El margen queda en 14 tokens.** Cualquier párrafo que alguien añada mañana a
   `REGLAS_NO_HACER.md`, `GLOSARIO.md`, `ESTADO-ACTUAL.md` o `00-INDICE.md` rompe el CI. Es el
   diseño del guardián (obliga a decidir), pero conviene saberlo: la próxima vez el recorte
   tendrá que salir de otra parte, no de estos dos archivos, que ya están al mínimo.
3. **El `HEAD` de `RUMBO.md` es manual** (está en la parte que no genera el script, como pedía el
   esqueleto del prompt). Envejece con cada commit: el bloque generado imprime el sha del commit
   más reciente, así que se ve la divergencia, pero el arreglo es a mano. Derivarlo sería una
   línea de `gen-rumbo.mjs`… y también una decisión sobre qué es «cabecera» y qué es «generado».
4. **El panel está desactualizado.** `.panel/estado.json` sigue diciendo `docs.arranque = 8 778`
   hasta que alguien corra `npm run panel`. No lo corrí: regenera el panel entero y hay 15
   archivos sucios de trabajo previo que no son de este prompt.
5. **15 archivos modificados que no son míos.** `git status` lista `CLAUDE.md`, `ESTADO-ACTUAL.md`,
   `criterios.prompts`, `docs/sistema/MATRIZ-UX.md`, `docs/sistema/pendientes.json`,
   `scripts/gen-estado.mjs`, `scripts/test-orden.mjs`, `scripts/gen-contexto-cline.mjs` y
   `docs/sistema/modulos/CICLO_EVALUACIONES_MODULO.md` con cambios anteriores a esta sesión. No
   los toqué ni los revertí.
6. **El separador de §16** mide 79 `=` mientras los otros quince miden 80 (typo antiguo del
   ensayo). El parser lo tolera (`^=+$`); se deja como está para no mezclar un arreglo estético
   con este cambio.
7. **`scripts/gen-seccion4.mjs` sigue sin `--check`.** Es el único generador del repo sin modo
   comprobación, ahora que estos dos sí lo tienen. No es de este prompt, pero es la asimetría
   que queda.
8. **`docs/sistema/MATRIZ-UX.md`** y **`matriz-ux-anterior-al-shell`**: fuera de alcance por
   mandato explícito del prompt. Aparecen en «Fuera de alcance ahora» de `RUMBO.md`, que es
   exactamente donde debían aparecer.



