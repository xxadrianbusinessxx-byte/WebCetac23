# PROMPT CLINE — P · Modularidad y renovación de la documentación

> Dos ejes de un análisis medido el **2026-09-28** sobre `main` (`c9453c7`).
> Las cifras vienen del panel (`npm run panel`) y de medición directa; **no
> re-investigues**, y si una no coincide con lo que veas, dilo antes de seguir.
>
> Va en **dos partes con parada entre ellas**. La primera toca código; la
> segunda, documentos. No las encadenes.

---

## ANTES DE NADA — genera tu contexto

```bash
node scripts/gen-contexto-cline.mjs --tarea=crear,arquitectura \
  lib/escolar/horario/horario-semanal.ts \
  lib/escolar/ciclo/evaluaciones.ts \
  lib/escolar/horario/horario-importar-validacion.ts \
  lib/escolar/asistencia/justificaciones.ts
```

Presta atención al bloque **«Tocar una suite: cuándo sí y cuándo no»**: aplica
entero a la Parte 2.

---

# PARTE 1 · Modularidad — sacar la decisión pura de los módulos con I/O

## Medición

El repo tiene **233 archivos** en `app/` y `lib/`, media de 218 líneas, y
**ninguno pasa de 1 000** (C9 en 0 desde el PROMPT E). El tamaño está resuelto.

Lo que no lo está es la **proporción**:

```
módulos -puro ..................  9
módulos con I/O (SupabaseClient) . 56
```

`ORDEN.md` §3 dice que «una decisión que se puede probar sin base de datos va en
un módulo puro **y debe tener suite**». Con 9 contra 56, esa regla es hoy la
excepción y no la norma.

### Los cuatro módulos donde hay decisión pura atrapada

Ordenados por cuánta hay, no por tamaño:

| Módulo | Líneas | Sitios con I/O | **Exports sin `async`** |
|---|---|---|---|
| `lib/escolar/horario/horario-semanal.ts` | 881 | 19 | **17** |
| `lib/escolar/ciclo/evaluaciones.ts` | 701 | 26 | **10** |
| `lib/escolar/horario/horario-importar-validacion.ts` | 702 | 6 | **5** |
| `lib/escolar/asistencia/justificaciones.ts` | 897 | 57 | **4** |

Un `export function` sin `async` en un módulo que recibe `SupabaseClient` es,
casi siempre, una decisión que no necesita la base y que **hoy no se puede
probar** porque el archivo no se carga sin ella.

**Los otros diez archivos de más de 700 líneas NO se tocan**: cuatro son
`app/actions/` (ya con 0 I/O, C8 lo garantiza) y seis son componentes, donde
el tamaño es presentación y partirlos no gana ninguna verificación.

## Resultado esperado

### R-1 · Un `-puro` por módulo, con las funciones MOVIDAS

Por cada uno de los cuatro: `<nombre>-puro.ts` con los exports sin `async` que
de verdad no necesiten la base, **movidos tal cual** (sin reescribir), y el
archivo original re-exportándolos para que **ningún import existente cambie de
ruta** — mismo criterio que el PROMPT E.

Requisitos del `-puro`: cero imports de I/O (ni el tipo `SupabaseClient`),
imports relativos (C1), y que compile y se ejecute sin base de datos. C5 lo
vigila.

**No arrastres una función solo porque no lleve `async`.** Si necesita la base
por dentro, se queda. Di en el informe cuáles descartaste y por qué: esa lista
vale tanto como la de las movidas.

### R-2 · Una suite por módulo nuevo

`scripts/test-<nombre>-puro.mjs`, siguiendo el patrón de
`test-uis-pendientes.mjs`. Y con la regla del PROMPT B4, que aquí es la que
importa:

> **Las pruebas se escriben contra el comportamiento ACTUAL.** Si al escribirlas
> descubres que una función hace algo que parece un bug, **no lo arregles**:
> descríbelo en el informe. Arreglarlo aquí mezclaría dos cambios y, si algo se
> rompiera después, no se sabría cuál fue.
>
> Ese aviso no es teórico: en el B4 la primera tanda de pruebas encontró un
> bucle infinito en `rutaCarpeta`, y la prueba que lo destapaba **colgó la
> suite**. Si una prueba no termina, desactívala con el caso escrito al lado.

Cada suite lleva su **fila en `scripts/README.md`** o C10 te la caza.

### R-3 · Cerrar el contador

Al terminar deben ser **13 módulos puros** y **45 suites**. Actualiza el número
de suites en `ESTADO-ACTUAL.md` en el MISMO cambio, o `verificar:estado` falla.

## Límites de la Parte 1

- ❌ No toques `app/actions/` ni los componentes.
- ❌ No cambies comportamiento: las 41 suites actuales dan lo mismo.
- ❌ No bajes ningún umbral de `test-orden.mjs`.
- ❌ No toques permisos.

Cierre: valida, reporta, **para**.

---

# PARTE 2 · Renovación — qué se limpia, qué se archiva y qué se mantiene

## Medición

```
docs/ .................... 1 356 KB en 95 archivos
  normativo/ .............    72 KB ·  7 archivos   OBLIGA
  sistema/ ...............   236 KB · 12 archivos   el presente
  historial/ ............. 1 020 KB · 74 archivos   el pasado (75 % del peso)
    informes/ ............   300 KB · 28
    prompts/ .............   272 KB · 22
    auditorias/ ..........   180 KB · 20

Arranque del agente ...... 10 212 tokens de un techo de 10 500 (8 archivos)
```

### Dos cosas que hay que separar, porque se confunden

**1. El peso de `docs/` NO es el coste de arranque.** `docs/historial/` son
1 020 KB y **no se lee nunca al arrancar**: no está en el presupuesto de
`docs/00-INDICE.md`. Su problema es de navegabilidad, no de tokens.

**2. «Huérfano» NO significa «borrable».** La medición encontró **31 documentos
que nadie cita**, y la mayoría lo están **por diseño**: un informe registra un
trabajo terminado y nadie lo enlaza; un prompt archivado sirve de plantilla.
Borrarlos sería borrar la memoria del repo. **No borres ningún informe ni
ningún prompt.**

## Lo que SÍ está desactualizado

### D-1 · `ESTADO-ACTUAL.md` va 15 commits atrás — y el CI lo marca

```
ESTADO-ACTUAL.md declara HEAD `f68fad6` y el real es `c9453c7`:
15 commits por detrás (máximo 10). La cabecera se quedó vieja.
```

`verificar:estado` **está en rojo ahora mismo**, así que el CI falla en el
próximo PR. Es lo primero.

No es solo cambiar el sha: repasa que lo que el documento afirma siga siendo
verdad después del sexto rol, la portada administrable y las constancias. Si
algo se volvió falso, corrígelo; si algo es narración de cómo se llegó, va a
`BITACORA-2026-09.md`. El archivo tiene **138 líneas de un límite de 150**, que
desde el PROMPT F es **fallo** y no aviso: lo que añadas tiene que caber.

### D-2 · `MATRIZ-UX` §§2, 3, 5 y 6 describen una UI que ya no existe

Está declarado en `pendientes.json` (`matriz-ux-anterior-al-shell`). Esas
secciones hablan de navegación por rutas con píldoras, de
`ui/barra-navegacion.tsx` y de `ui/glossy-nav-pill.tsx` — retirados en
`8d17188`. Hoy la navegación son pestañas desde
`lib/navegacion/mapa-navegacion.ts`.

Reescríbelas contra la UI que existe. El resto del documento (tokens medidos,
bitácora) **no se toca**.

### D-3 · Las 20 auditorías de ciclo: consolidar, no borrar

`docs/historial/auditorias/` son 20 archivos y 180 KB de las fases F1–F10 del
ciclo escolar, todas huérfanas y todas cerradas. `F1-F10-CIERRE-TECNICO.md`
(491 líneas) ya es el cierre de ese trabajo.

Propuesta —y si al abrirlas el contenido dice otra cosa, **dilo en vez de
seguirla**—: un `docs/historial/auditorias/README.md` que diga qué fue cada
fase, en qué commit cerró y a qué archivo ir. Los archivos **se quedan**. Lo que
se gana es que se pueda entrar sin abrir veinte.

### D-4 · `database.types.ts` sigue sin generarse

Pendiente declarado: falta Docker o un token de la CLI. **No lo resuelvas a
mano escribiendo tipos**: eso crearía una segunda fuente para lo que la base ya
declara (R6). Comprueba si hoy se puede generar; si no, deja el pendiente con
lo que falta escrito con precisión.

## Lo que NO se toca en la Parte 2

- ❌ **Ningún informe de `docs/historial/informes/`**, los 28. Son la memoria.
- ❌ **Ningún prompt de `docs/historial/prompts/`**, los 22.
- ❌ Los archivos de arranque, salvo `ESTADO-ACTUAL.md` (D-1). Tocar
  `AGENTS.md`, `RUMBO.md`, `INVARIANTES.md`, `GLOSARIO.md`,
  `REGLAS_NO_HACER.md` o `00-INDICE.md` mueve el techo de arranque, y eso es
  decisión del responsable.
- ❌ `docs/normativo/` entero: obliga. Si algo de ahí está mal, se reporta.

> **Sobre el arranque a 10 212 de 10 500.** No lo recortes en este prompt. Está
> a 288 del techo y hay que decidir si se sube el techo o se poda — y eso es una
> decisión, no una tarea. Repórtalo con la tabla por archivo que da
> `node scripts/verificar-docs.mjs`.

Cierre: valida, reporta.

---

## VALIDACIÓN — al cierre de CADA parte

```bash
npx tsc --noEmit
npm run test:ci                     # 45/45 al cerrar la Parte 1
npm run test:permisos
node scripts/gen-matriz-permisos.mjs --check
node scripts/test-orden.mjs          # las 15 reglas, C8 y C9 en 0
node scripts/verificar-docs.mjs      # rutas muertas en 0
npm run verificar:estado             # EN VERDE (hoy está en rojo)
npm run lint
npm run build
npm run panel
```

---

## INFORME FINAL

### Parte 1
Qué se movió a cada `-puro`, y **qué se dejó dentro y por qué** — esa segunda
lista es la que demuestra que hubo criterio y no un barrido.

### Hallazgos
Lo que las pruebas nuevas destaparon y **no** se arregló. Si alguna quedó
desactivada, con el caso escrito al lado.

### Parte 2
Qué se puso al día, qué se consolidó, y **qué NO se tocó pudiendo hacerlo**.

### Contadores
9 → 13 puros · 41 → 45 suites · `verificar:estado` de rojo a verde.

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

> **Este prompt NO autoriza ningún borrado.** Ni informes, ni prompts, ni
> auditorías. Lo único que se retira es texto obsoleto DENTRO de documentos que
> siguen vivos (D-2). Si crees que algo debe borrarse, proponlo en el informe.
