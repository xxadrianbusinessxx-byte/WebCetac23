# PROMPT F — Higiene final: 17 errores de lint, `_borrador` y el recorte de `ESTADO-ACTUAL.md`

> Cierra **PROMPT-5/B5**, el punto 2 de la evaluación del 09-08 y la deuda de
> tamaño de `ESTADO-ACTUAL.md`. Medido el 2026-09-16 — **no re-investigar**.
> Puede ejecutarse antes o después del Prompt E; no se solapan.

---

## OBJETIVO

Dejar el repo en un estado donde **el CI sostenga lo que hoy sostiene una
persona**: lint en verde y con puerta, `_borrador` resuelto por decisión
explícita, y el documento de estado dentro de su propio límite.

---

## ESTADO ACTUAL (medido, no re-investigar)

### El lint ya está desatascado; quedan 17 errores reales

El 2026-09-16 había 151 errores, pero **135 eran ruido**: `scripts/.tmp-*/`
(el JS compilado de las suites, gitignorado) se estaba linteando. Ya se ignora
en `eslint.config.mjs`. Lo que queda es **código de app**:

| Regla | Nº | Naturaleza |
|---|---|---|
| `react-hooks/set-state-in-effect` | 15 | `setState` síncrono dentro de un efecto |
| `@typescript-eslint/no-require-imports` | 1 | un `require()` en código de app |
| `@next/next/no-html-link-for-pages` | 1 | `<a href="/">` en vez de `<Link>` |
| `@typescript-eslint/no-unused-vars` | 25 | **warnings**, no errores |

**El paso de lint NO está en el CI todavía**, a propósito: con 17 errores el CI
nacería en rojo. Activarlo es parte de este prompt, **al final**.

### `_borrador` sigue en pie (B5)

`app/_borrador/` y `lib/_borrador/` existen. La cuarentena es hermética (solo se
referencian entre sí) y `lib/_borrador/README.md` explica módulo por módulo qué
contiene y cuál es el más valioso (`migracion-catalogo.ts`, 25.6 KB).

### `ESTADO-ACTUAL.md`: 516 líneas con una regla de ~150

Su cabecera y su nº de suites ya se verifican en CI
(`npm run verificar:estado`). El límite de tamaño está como **aviso** porque el
recorte necesita criterio, no un corte mecánico.

---

## RESULTADO ESPERADO

### R-1 · Los 15 `set-state-in-effect`, uno por uno
No hay arreglo mecánico. Por cada caso, elegir **con criterio** entre:
- derivar el valor durante el render (lo más habitual: no hacía falta estado);
- calcularlo en un `useMemo`;
- mover el `setState` al callback del evento o de la promesa que lo provoca;
- si de verdad es sincronización con un sistema externo, dejarlo y **justificarlo
  en un comentario** con `// eslint-disable-next-line` explicando por qué.

**Prohibido silenciar en bloque.** Un `disable` sin justificación es peor que el
error: lo esconde.

### R-2 · El `require()` y el `<a href="/">`
Mecánicos: `import` y `<Link>` de `next/link`.

### R-3 · Los 25 warnings de variables sin usar
Borrar el import o la variable. Si alguna está ahí **a propósito** (una firma que
debe mantenerse), renombrarla con `_` delante, que es la convención de la regla.

### R-4 · Resolver `_borrador` con decisión POR ARCHIVO
Para cada módulo de `app/_borrador/` y `lib/_borrador/`, una de tres, escrita en
el informe con su motivo:
- **restaurar** (alguien lo necesita de verdad → vuelve a su familia en `lib/`);
- **archivar** (valioso pero sin consumidor → `scripts/_archivo/` o
  `docs/historial/`, con nota de dónde vino);
- **eliminar** (ni valioso ni usado).

`migracion-catalogo.ts` está marcado como «lo más valioso de esta carpeta»:
**no se elimina sin decirlo explícitamente en el informe**. El chat
(`app/_borrador/chat/`) se retira, que era la intención original de B5.

### R-5 · Recortar `ESTADO-ACTUAL.md` a ~150 líneas
Se queda **solo lo que es verdad hoy y hace falta para arrancar**. Se va a
`docs/historial/` todo lo que sea narración de cómo se llegó aquí: las §5b y §5c
completas, el detalle de la Fase 0 del rediseño Océano, y los relatos por PROMPT.

Criterio: si una frase empieza por «tras PROMPT-N» o cuenta una decisión pasada,
es historial. Si describe **el estado**, se queda.

El destino lleva un enlace de vuelta, y `ESTADO-ACTUAL.md` enlaza al historial
para quien quiera el porqué.

### R-6 · Activar la puerta (lo ÚLTIMO)
Con R-1 a R-3 cerrados y `npm run lint` en 0 errores:
- añadir el paso de lint al workflow, junto a los demás;
- en `scripts/verificar-estado-actual.mjs`, cambiar el `avisos.push` del límite
  de líneas por `fallos.push` (está comentado en el propio archivo).

---

## REGLAS

1. **Cero cambios de comportamiento.** Es higiene: las 36 suites dan lo mismo.
2. Cuidado especial en R-1: quitar un `setState` de un efecto **puede** cambiar
   cuándo se pinta algo. Si un caso no es claramente equivalente, dejarlo con
   `disable` justificado en vez de arriesgar una regresión de UI.
3. R-4 es la única parte que **borra** cosas, y solo con decisión por archivo
   escrita. Ante la duda, archivar en vez de eliminar (R8).
4. Sin SQL, sin migraciones, sin tocar la base.

---

## LÍMITES

- ❌ No toca los 13 archivos de `app/actions/` con `.from()` ni parte los
  módulos gigantes (eso es el Prompt E).
- ❌ No toca permisos: 475 y 229 checks deben seguir iguales.
- ❌ No reescribe el rediseño Océano.

---

## VALIDACIÓN

1. `npx tsc --noEmit` · `npm run test:ci` (36/36) · `npm run build`.
2. `npm run lint` → **0 errores, 0 warnings**.
3. `npm run verificar:estado` → OK con el límite de líneas **ya como fallo**.
4. `wc -l ESTADO-ACTUAL.md` ≤ ~150.
5. `ls app/_borrador lib/_borrador` → o no existen, o queda solo lo que el
   informe justifique.

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

> **Excepción autorizada al punto 3 del contrato, solo para R-4:** este prompt
> **sí** autoriza eliminar archivos de `_borrador/`, con decisión por archivo
> justificada en el informe. Ningún otro borrado está autorizado.
