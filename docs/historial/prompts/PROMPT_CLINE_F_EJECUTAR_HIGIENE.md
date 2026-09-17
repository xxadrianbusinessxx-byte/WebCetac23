# PROMPT CLINE — F · Higiene final: lint en verde con puerta, `_borrador` resuelto y `ESTADO-ACTUAL` dentro de su límite

> Ejecuta `docs/normativo/PROMPT_F_HIGIENE_FINAL.md`. Ese documento tiene el
> **qué**; este tiene el **cómo**, la secuencia y las paradas.
>
> **Medición rehecha el 2026-09-16, después del Prompt E.** El documento
> normativo se escribió antes y tres de sus cifras ya no son ciertas: se
> corrigen abajo. Usa estas.

---

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto-cline.mjs --tarea=apariencia \
  app/components/calendario-asistencia-alumno.tsx \
  app/components/calendario-escolar-panel.tsx \
  app/directivo/directivo-client.tsx
```

Lee solo lo que salga. Presta atención al bloque **«Tocar una suite: cuándo sí
y cuándo no»**: aplica igual aquí.

---

## MEDICIÓN INICIAL (pegada — no re-investigar)

### Lint: 17 errores, pero **dos no son de código de app**

```
15  react-hooks/set-state-in-effect
 1  @next/next/no-html-link-for-pages
 1  @typescript-eslint/no-require-imports
```

| Archivo | Línea | Regla |
|---|---|---|
| `app/components/calendario-asistencia-alumno.tsx` | 251, 255 | set-state |
| `app/components/calendario-escolar-panel.tsx` | 175, 203 | set-state |
| `app/directivo/directivo-client.tsx` | 167, 178 | set-state |
| `app/components/documentos-panel.tsx` | 127 | set-state |
| `app/components/justificaciones-admin.tsx` | 90 | set-state |
| `app/components/materias-config-panel.tsx` | 48 | set-state |
| `app/components/mensajes-tutor-panel.tsx` | 45 | set-state |
| `app/components/profesores-credenciales-panel.tsx` | 44 | set-state |
| `app/components/oceano/contenido-directivo-oceano.tsx` | 111 | set-state |
| `app/components/oceano/contenido-docente-oceano.tsx` | 95 | set-state |
| `app/profesor/profesor-client.tsx` | 92 | set-state |
| **`app/_borrador/semestres-admin.tsx`** | 46 | set-state · **cuarentena** |
| **`scripts/_archivo/fix-div-tags.js`** | 1 | require · **archivo consumido** |

**Corrección al documento normativo.** Dice «lo que queda es código de app».
No del todo: **2 de los 17 están en código que no debería lintarse**.
`scripts/_archivo/` es, por definición de ORDEN.md §4, «un solo uso ya
consumido, no re-ejecutar», y `app/_borrador/` es cuarentena. Lintarlos es el
mismo error que lintar `scripts/.tmp-*/`, que generaba 135 errores fantasma y
ya se arregló por exclusión. **Errores reales de código vivo: 15.**

### Warnings: 40, y no son los que dice el documento

```
27  @typescript-eslint/no-unused-vars
 9  directivas eslint-disable que ya no suprimen nada
 4  react-hooks/exhaustive-deps
```

El normativo dice «25 warnings de variables sin usar» y se queda ahí. Las 9
directivas muertas (`eslint-disable` de `no-constant-condition` que ya no
aplica) son la señal de que el código cambió y las supresiones no: se borran,
no se conservan.

### `_borrador`: 21 archivos, cuarentena hermética (verificado)

```
app/_borrador/  chat/{page,chat-client,chat-actions} · ciclo-evaluaciones-admin (724)
                reconocimiento-academico (719) · contexto-academico-panel (211)
                semestres-admin (156) · evento-visor (118) · README
lib/_borrador/  migracion-catalogo (741) · chat/{storage,comentario-codigo,types,constants}
                parse-hoja (77) · capas (53) · demo-users · materias-alumno
                materias-demo · client · README
```

**Nadie fuera de la cuarentena los importa** — comprobado con `grep`. Eliminar
cualquiera de ellos no puede romper un import.

### `ESTADO-ACTUAL.md`: **270 líneas**, no 516

El normativo dice 516. Ya se recortaron 274 líneas en `659300a` (la §7 era un
changelog y se movió entera a `docs/historial/BITACORA-2026-09.md`). Faltan
~120 para el límite de ~150.

| Sección | Líneas |
|---|---|
| §6 Pendiente humano | 38 |
| §5 Estado de datos | 34 |
| §4 Seguridad | 33 |
| §7 Estructura | 52 |
| §5b Inscripciones | 21 |
| §5c Credenciales | 21 |
| §1 · §2 · §3 · §8 | 56 |

### Punto de partida que no puede empeorar

```
tsc --noEmit ....... 0        test-orden ....... 10/10, C8=0 y C9=0 (DURAS)
test:ci ............ 37/37    test:permisos .... 475 + 229
gen:matriz --check . exit 0   build ............ 9 rutas
lint ............... 17 errores · 40 warnings
```

---

## SECUENCIA — cinco partes, con parada entre cada una

> **Reordenado respecto al normativo, y por un motivo concreto:** allí
> `_borrador` es R-4, después de arreglar el lint. Pero uno de los 17 errores
> vive en `app/_borrador/semestres-admin.tsx`. Arreglarlo y luego borrar el
> archivo es trabajo tirado. **Primero se decide qué existe; luego se limpia lo
> que quedó.**

### Parte 1 · qué se lintea, y qué existe

**1a.** Excluir de `eslint.config.mjs`, junto a `scripts/.tmp-*/**` y con el
mismo tipo de comentario explicando por qué:

```
scripts/_archivo/**      un solo uso ya consumido (ORDEN.md §4)
scripts/_peligrosos/**   no se ejecutan; no se mantienen
app/_borrador/**         cuarentena — mientras exista
lib/_borrador/**         idem
```

**1b.** Resolver `_borrador`, **decisión por archivo escrita en el informe**,
una de tres:

- **restaurar** → vuelve a su familia en `lib/` (y entonces **sí** se lintea);
- **archivar** → `scripts/_archivo/` o `docs/historial/`, con nota de dónde vino;
- **eliminar** → ni valioso ni usado.

Dos avisos que no son negociables:

- `lib/_borrador/migracion-catalogo.ts` (741 líneas) está marcado por el propio
  README como **lo más valioso de la carpeta**. No se elimina sin decirlo
  explícitamente y argumentarlo. Ante la duda, **archivar** (R8).
- El chat (`app/_borrador/chat/` + `lib/_borrador/chat/`) se retira: era la
  intención original de B5, y `ESTADO-ACTUAL` ya declara que la tabla
  `COMENTARIOS` no se toca.

Cierre: `npm run lint` debe bajar a **15 errores**. Valida. **Para.**

### Parte 2 · los 15 `set-state-in-effect`, uno por uno

**No hay arreglo mecánico y está prohibido silenciarlos en bloque.** Por cada
caso, elige con criterio:

1. derivar el valor durante el render — lo más frecuente: no hacía falta estado;
2. `useMemo`;
3. mover el `setState` al callback del evento o de la promesa que lo provoca;
4. si de verdad es sincronización con un sistema externo, dejarlo con
   `// eslint-disable-next-line` **y el porqué escrito**.

**Ejemplo trabajado**, `contenido-directivo-oceano.tsx:111` — lo escribí yo en
esta misma rama, así que no es código antiguo de nadie:

```tsx
useEffect(() => {
  setRegistro(""); setRotulo(""); setVista(null);
}, [pieza]);
```

Es «al cambiar de apartado, olvida lo seleccionado». La forma idiomática no es
un efecto: es **remontar con `key={pieza}`**, que reinicia el estado sin
sincronizar nada. `contenido-docente-oceano.tsx:95` es el mismo patrón.

> **Riesgo real, y por eso este apartado va solo.** Quitar un `setState` de un
> efecto puede cambiar **cuándo** se pinta algo. Si un caso no es
> *claramente* equivalente, déjalo con `disable` justificado en vez de
> arriesgar una regresión de interfaz que ninguna suite detecta.

Cierre: **0 errores**. Valida. **Para.**

### Parte 3 · los 40 warnings

- **9 directivas muertas** → borrarlas. No suprimen nada.
- **27 variables sin usar** → borrar el import o la variable. Si alguna está a
  propósito (una firma que debe conservarse), prefijarla con `_`.
- **4 `exhaustive-deps`** → los más delicados después de la Parte 2: añadir la
  dependencia puede provocar un bucle. Si añadirla cambia el comportamiento,
  `disable` justificado.

Cierre: **0 errores, 0 warnings**. Valida. **Para.**

### Parte 4 · `ESTADO-ACTUAL.md` de 270 a ~150

Criterio del normativo: *si una frase empieza por «tras PROMPT-N» o cuenta una
decisión pasada, es historial; si describe el estado, se queda.* Destino:
`docs/historial/BITACORA-2026-09.md`, que ya existe y ya recibe este material.

Candidatos claros: **§5b** (21) y **§5c** (21) enteras, y el bloque de la Fase 0
del rediseño Océano dentro de §4.

> **Y una duplicación que el normativo no podía conocer, porque el panel es
> posterior.** La **§6 «Pendiente humano» (38 líneas) duplica hoy
> `docs/sistema/pendientes.json`**, que es lo que el panel lee y renderiza. Al
> menos cuatro entradas son la misma: claves compartidas de profesores, rotar
> la contraseña de Supabase, las 68 filas sin `periodo_id` y estrenar el
> traspaso de materia.
>
> Eso ya no es «recortar»: son **dos fuentes para la misma verdad (R6)**, y ya
> divergieron — `pendientes.json` sigue diciendo que el lint «subió a 151
> errores», que es falso desde `6809024`.
>
> **`pendientes.json` se queda como fuente** (es la que el panel consume) y §6
> pasa a ser un puntero de tres líneas. Antes de recortar, verifica que ningún
> pendiente de §6 se pierda: los que no estén en el JSON, se añaden. **Y
> corrige de paso la entrada del lint**, que este prompt deja obsoleta.

Cierre: `wc -l ESTADO-ACTUAL.md` ≤ ~150 y `npm run verificar:estado` en OK.
Valida. **Para.**

### Parte 5 · activar las puertas (lo ÚLTIMO)

Solo con lint en 0/0 y `ESTADO-ACTUAL` bajo el límite:

1. Añadir el paso de lint a `.github/workflows/verificacion.yml`, junto a los demás.
2. En `scripts/verificar-estado-actual.mjs`, cambiar el `avisos.push` del límite
   de líneas por `fallos.push`. El propio archivo lo dice en un comentario:
   *«en cuanto ese recorte aterrice, cambiar `avisos.push` por `fallos.push`»*.

**Este es el único orden posible.** Activar la puerta antes haría nacer el CI
en rojo, y un CI que nace en rojo se ignora en una semana.

---

## REGLAS

1. **Cero cambios de comportamiento.** Las 37 suites dan lo mismo. Si una
   cambia de resultado, para.
2. **Prohibido el `disable` en bloque.** Un `eslint-disable` sin justificación
   escrita es peor que el error: lo esconde. Cada uno lleva su porqué.
3. **R8 ante la duda: archivar, no eliminar.** La Parte 1b es la única del
   repo autorizada a borrar, y solo con decisión por archivo escrita.
4. **No bajes un umbral de `test-orden.mjs`.** C8 y C9 acaban de pasar a
   DURAS con el Prompt E; tienen que seguir en 0.
5. Sin SQL, sin migraciones, sin tocar la base.

---

## LÍMITES

- ❌ No toques `app/actions/` ni partas módulos: eso ya lo cerró el Prompt E.
- ❌ No toques permisos: 475 y 229, exactos.
- ❌ No reescribas el rediseño Océano — salvo los dos `set-state` de sus dos
  archivos, que son parte del trabajo.
- ❌ No toques `scripts/gen-estado.mjs` ni `scripts/gen-panel.mjs`.

---

## VALIDACIÓN — al cierre de CADA parte

```bash
npx tsc --noEmit
npm run test:ci
npm run test:permisos
node scripts/gen-matriz-permisos.mjs --check
node scripts/test-orden.mjs      # C8 y C9 siguen en 0
npm run lint                     # el número de esta parte
npm run build
npm run panel                    # deja el estado a la vista
```

Pega el antes/después del lint en cada parte.

---

## INFORME FINAL

### Implementado
Parte por parte.

### `_borrador`: la tabla de decisiones
Un archivo por fila: **restaurar / archivar / eliminar**, y el motivo. Es la
parte del informe que más va a mirarse dentro de seis meses.

### Los 15 `set-state`
Cuál de las cuatro salidas se eligió en cada uno. Y de los que quedaron con
`disable`: por qué no era equivalente.

### Validación
Antes/después del lint y el resto de la tabla.

### Puertas activadas
Qué sostiene el CI ahora que antes sostenía una persona.

### Pendiente
Solo lo que requiera otra intervención.

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

> **Excepción autorizada al punto 3, SOLO para la Parte 1b:** este prompt
> autoriza eliminar archivos de `app/_borrador/` y `lib/_borrador/`, con
> decisión por archivo justificada en el informe. Ningún otro borrado está
> autorizado.
