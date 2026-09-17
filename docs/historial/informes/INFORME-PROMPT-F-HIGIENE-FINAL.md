# INFORME — PROMPT F · Higiene final: lint en verde con puerta, `_borrador` resuelto y `ESTADO-ACTUAL` dentro de su límite

> Ejecutado el 2026-09-16 sobre `feature/capas-y-tamano`, siguiendo
> `docs/historial/prompts/PROMPT_CLINE_F_EJECUTAR_HIGIENE.md` (que ejecuta
> `docs/normativo/PROMPT_F_HIGIENE_FINAL.md`). Cero cambios de comportamiento:
> las 37 suites dan lo mismo, los permisos no se tocaron y **C8/C9 siguen en 0**.

---

## Implementado

### Parte 1 · qué se lintea, y qué existe

**1a — exclusiones.** `eslint.config.mjs` gana cuatro globs con su porqué escrito:
`scripts/_archivo/**` (un solo uso ya consumido, ORDEN.md §4), `scripts/_peligrosos/**`
(no se ejecutan ni se mantienen), `app/_borrador/**` y `lib/_borrador/**` (cuarentena).
De los 17 errores del punto de partida, **2 vivían ahí** (un `require()` en
`scripts/_archivo/fix-div-tags.js` y un `setState` en `app/_borrador/semestres-admin.tsx`).
Los globs se quedan aunque las carpetas desaparezcan: un `_borrador/` futuro no vuelve a
llenar la salida.

**1b — `_borrador` resuelto archivo por archivo** (tabla completa más abajo). Las dos
carpetas **ya no existen**.

Cierre: **17 → 15 errores, 40 → 28 warnings**.

### Parte 2 · los 15 `set-state-in-effect`, uno por uno

**Ninguno se silenció: los 14 de código vivo se arreglaron de verdad**, y el decimoquinto
(el de `semestres-admin.tsx`) desapareció con la cuarentena. Se usaron **dos** de las
cuatro salidas del prompt:

1. **Mover el `setState` al callback de la promesa** (12 casos). El patrón ya existía en
   el repo —`buscador-alumno-profesor.tsx` y `horario-escolar-panel.tsx` cargan datos con
   `actionX().then(cb)`— y es el que la regla acepta: un `setState` dentro de un callback
   de promesa no está en la fase síncrona del efecto. La lógica de cada loader se conserva
   **entera y en un solo sitio**; lo único que cambia es dónde se escribe el estado.

   | Archivo | Loader | Salida |
   |---|---|---|
   | `documentos-panel.tsx:127` | `cargar` | cadena `action.then(cb)` |
   | `justificaciones-admin.tsx:90` | `cargar` | cadena con `Promise.all` |
   | `mensajes-tutor-panel.tsx:45` | `cargar` | cadena `action.then(cb)` |
   | `profesores-credenciales-panel.tsx:44` | `recargar` | cadena `action.then(cb)` |
   | `directivo-client.tsx:167` | `refrescarVista` | cadena `action.then(cb)` |
   | `directivo-client.tsx:178` | `refrescarVistaRegistro` | cadena `action.then(cb)` |
   | `profesor-client.tsx:92` | `refrescarVista` | cadena `action.then(cb)` |
   | `calendario-asistencia-alumno.tsx:251` | `cargar` | cadena `action.then(cb)` |
   | `calendario-asistencia-alumno.tsx:255` | `cargarJustificaciones` | cadena `action.then(cb)` |
   | `calendario-escolar-panel.tsx:175` | `cargarCiclos` | el arreglo va en la **llamada**: `void Promise.resolve().then(() => cargarCiclos())` |
   | `calendario-escolar-panel.tsx:203` | `cargarDias` | cadena `action.then(cb)` |
   | `oceano/contenido-docente-oceano.tsx:95` | `refrescar` | cadena `action.then(cb)` |

   **Por qué `cargarCiclos` es el caso raro:** su cuerpo lo vigila una suite.
   `test-auditoria-ciclo-f5.mjs` comprueba que, en modo periodo, el panel **no** fuerza la
   lista legacy de ciclos, y lo hace con una aserción de forma sobre el código
   (`if (modoPeriodo) { setCiclos([]); return; }`). Tocar el loader habría hecho fallar una
   suite sin cambiar comportamiento, así que se dejó su cuerpo **intacto** y el arreglo se
   hizo en la llamada del efecto. Es lo que el propio prompt pide: la suite no se toca.

2. **Estado derivado durante el render** (2 casos, los dos de «al cambiar X, olvida lo
   seleccionado» que el prompt puso como ejemplo trabajado). En vez de un efecto que
   sincroniza, el estado guarda **a qué X pertenece** y durante el render se compara:

   - `oceano/contenido-directivo-oceano.tsx:111` → `piezaDeSeleccion !== pieza` reinicia
     `registro`/`rotulo`/`vista`. **El `filtro` se conserva a propósito** entre apartados,
     así que el `key={pieza}` del prompt **no era equivalente** (habría reiniciado también
     el filtro): se eligió el guard, que reinicia exactamente lo mismo que el efecto.
   - `materias-config-panel.tsx:48` → `materiasPrevias !== materias` re-espeja la prop del
     servidor (tras `router.refresh()`), conservando la copia local que el panel edita en
     caliente.

3. **El `require()` y el `<a href="/">` (R-2).** El `require()` estaba en
   `scripts/_archivo/` y se fue con la exclusión. El `<a href="/">` de
   `contenido-marcador-oceano.tsx` pasó a `<Link href="/">` de `next/link`.

**Ningún `eslint-disable` nuevo.** Los dos que existen en el repo son anteriores a este
prompt (`etiquetas-dinamicas-panel.tsx:83`, `calendario-escolar-panel.tsx:187`) y siguen
ahí con su comentario: son sincronización con una prop, el caso que la propia regla
reconoce como legítimo.

Cierre: **15 → 0 errores**.

### Parte 3 · los warnings

- **Directivas muertas**: borradas las 2 que caían en código linteado
  (`lib/escolar/alumno/alumnos.ts`, `scripts/probe-curps-duplicados.mjs`). Las otras 7
  vivían en la cuarentena y en `scripts/_archivo/` (se van con la exclusión).
- **Variables e imports sin usar**: 12 en `app/` y `lib/` y 8 en `scripts/`. Nunca se tocó
  una llamada: donde el valor se usaba solo por su efecto (`const res = await f()`), se
  dejó la llamada y se quitó el binding. Dos funciones muertas se eliminaron enteras
  (`patchLote`, `elegidaSegunSync`), y dos variables de suite que habían quedado sin
  consumidor (`conDias`, `pB`) también.
- **`exhaustive-deps` (4)**: las que quedaban se resolvieron **añadiendo la dependencia**
  (`modoPeriodo` en los dos efectos del panel de calendario; `curp` en el efecto que carga
  la vista de materia del alumno). Las tres son props/estado que no se escriben desde el
  efecto, así que no hay bucle posible; y en el caso de `curp` la dependencia **faltaba de
  verdad** (cambiar de alumno no recargaba su vista).

Cierre: **28 → 1 warning**, y ese uno está en un archivo que el prompt prohíbe tocar
(ver «Pendiente»).

### Parte 4 · `ESTADO-ACTUAL.md` de 270 a 149 líneas

Se movió a `docs/historial/BITACORA-2026-09.md` (sección nueva «Traslado desde
ESTADO-ACTUAL.md», +125 líneas, **sin borrar nada**, R8): la **Fase 0** del rediseño
Océano dentro de §4, y **§5b y §5c completas** con sus mediciones antes/después.

Lo que se queda es estado, y se condensó sin perder un dato: la §4 conserva la decisión
viva del directivo (tres capacidades nuevas, consecuencia intencionada de
solicitar+aprobar), y §5 conserva las cifras con su fecha y su «volver a medir».

**§6 dejó de ser una segunda fuente.** Duplicaba `docs/sistema/pendientes.json` (la que el
panel lee) y ya había divergido: el JSON seguía diciendo que el lint «subió a 151
errores». Ahora §6 es un puntero y el JSON es la fuente única:
- se corrigió la entrada del lint, que este prompt deja obsoleta → **cerrada**;
- se actualizó `prompt5-parte-b`: **B3 y B5 cerrados**, queda B4;
- se **añadió** el único pendiente de §6 que no estaba en el JSON
  (`deshacer-paso-datos-reales`).

Cierre: **149 líneas** (límite ~150) y `npm run verificar:estado` en **OK**.

### Parte 5 · las puertas (al final, y solo entonces)

1. `.github/workflows/verificacion.yml`: paso **`npm run lint`** entre `tsc` y las suites
   (y de paso el rótulo «34 suites» → «37 suites», que ya era falso).
2. `scripts/verificar-estado-actual.mjs`: el límite de líneas de `ESTADO-ACTUAL.md` pasa
   de **aviso** a **fallo**, como el propio archivo pedía en su comentario.

Las dos juntas son el objetivo del prompt: **lo que antes sostenía una persona ahora lo
sostiene el CI**.

---

## `_borrador`: la tabla de decisiones

21 archivos. **9 archivados**, **11 eliminados** y los 2 README conservados como
documentación del archivo. Destino: `scripts/_archivo/borrador/` (excluido del lint por
ORDEN.md §4, y sigue bajo `tsc`). El «porqué» completo, archivo por archivo, está en el
`README.md` de esa carpeta.

| Archivo (origen) | Decisión | Motivo |
|---|---|---|
| `lib/_borrador/migracion-catalogo.ts` | **archivar** | Lo más valioso de la carpeta, por el propio README: siembra de catálogo e inscripciones desde etiquetas. Su único consumidor ya estaba archivado. Rehacerlo costaría más que conservarlo. **No se elimina.** |
| `lib/_borrador/parse-hoja.ts` | **archivar** | Lectura de la hoja de calificaciones; sin consumidor, pero es lógica no trivial. |
| `lib/_borrador/capas.ts` | **archivar** | `separarCapasDecoracion`/`STICKER_LAYOUT`; sin consumidor desde que la decoración viva es `decoraciones/config.ts`. |
| `app/_borrador/ciclo-evaluaciones-admin.tsx` | **archivar** | 692 líneas de UI completa. El equivalente vivo es el ciclo-configurador; se conserva como referencia. |
| `app/_borrador/reconocimiento-academico.tsx` | **archivar** | 682 líneas; el flujo vivo es la carga académica + roster. |
| `app/_borrador/contexto-academico-panel.tsx` | **archivar** | 196 líneas; el contexto de ciclo se configura en el ciclo-configurador. |
| `app/_borrador/semestres-admin.tsx` | **archivar** | 147 líneas; la oferta de semestres se administra en `/configuracion`. |
| `app/_borrador/evento-visor.tsx` | **archivar** | 109 líneas, sin dependencias de dominio: podría reutilizarse tal cual. |
| `README.md` (×2, app y lib) | **archivar** | Inventario original: es la memoria de dónde salió cada archivo. |
| `app/_borrador/chat/*` (3) · `lib/_borrador/chat/*` (4) | **eliminar** | El chat se retiró por decisión de producto el 2026-09-06; el prompt lo pide expresamente. Su tipo útil (`GeneroUsuario`) ya se había rescatado a `lib/escolar/types.ts`, el agujero de autorización está documentado en `MATRIZ-PERMISOS.md` §6.1, y la tabla `COMENTARIOS` no se toca. |
| `lib/_borrador/materias-alumno.ts` | **eliminar** | Superado por la resolución del catálogo (`resolverMateriasAlumno`), que es la fuente única (R6). |
| `lib/_borrador/demo-users.ts` | **eliminar** | Resto de la etapa de demo; el portal real usa `lib/auth/portal-login.ts`. |
| `lib/_borrador/materias-demo.ts` | **eliminar** | Datos de ejemplo de la demo. |
| `lib/_borrador/client.ts` | **eliminar** | Cliente de navegador: usarlo expondría consultas con RLS `USING (true)`, y la autorización vive en TypeScript del servidor. Su valor es de documentación, y esa advertencia se conserva en el README del archivo. |

**Nada se borró sin decisión escrita**, y ningún archivo se restauró: ninguno tenía
consumidor real (el repo lo venía declarando desde el 2026-09-06).

---

## Validación

`npm run lint` — antes / después, parte por parte:

| Momento | Errores | Warnings |
|---|---|---|
| Punto de partida | **17** | **40** |
| Tras 1a (exclusiones) | 15 | 28 |
| Tras 1b (`_borrador` resuelto) | 15 | 28 |
| Tras la Parte 2 (los 14 `set-state` + `<Link>`) | **0** | 29 |
| Tras la Parte 3 (warnings) | **0** | **1** |

El único warning que queda es `'MARCA' is assigned a value but never used` en
`scripts/gen-panel.mjs`: el prompt prohíbe expresamente tocar ese archivo (ver
«Pendiente»). `npm run lint` **sale con código 0**, que es lo que la puerta del CI
necesita.

| Comprobación | Antes | Después |
|---|---|---|
| `npx tsc --noEmit` | 0 | **0** |
| `npm run test:ci` | 37/37 + estado | **37/37 + estado al día** |
| `npm run test:permisos` | 475 + 229 | **475 + 229**, 0 fallidas |
| `node scripts/gen-matriz-permisos.mjs --check` | exit 0 | **exit 0** |
| `node scripts/test-orden.mjs` | 10/10 (C8 y C9 duras en 0) | **10/10, C8 y C9 en 0** |
| `npm run build` | 9 rutas | **9 rutas** |
| `npm run panel` | — | escrito, sin alertas nuevas |
| `npm run verificar:estado` | OK (límite = aviso) | **OK (límite = FALLO)** |
| `wc -l ESTADO-ACTUAL.md` | 270 | **149** |

Dos suites hubo que **reenrutar** (no relajar): `test-auditoria-ciclo-f2.mjs` leía
`app/_borrador/reconocimiento-academico.tsx`, que la Parte 1b archivó → ahora lee
`scripts/_archivo/borrador/reconocimiento-academico.tsx` con la aserción **idéntica**;
`test-auditoria-ciclo-f5.mjs` no se tocó y se conservó la forma de código que vigila
(ver Parte 2). Ambas dan el mismo resultado que antes.

---

## Puertas activadas

Ahora sostiene el CI lo que antes sostenía una persona:

1. **`npm run lint` en el workflow** (`.github/workflows/verificacion.yml`, entre `tsc` y
   las suites). Se activó **al final**, con el repo en 0 errores: activarlo antes habría
   hecho nacer el CI en rojo, y un CI que nace en rojo se ignora en una semana.
2. **El límite de ~150 líneas de `ESTADO-ACTUAL.md` es un fallo**, no un aviso
   (`scripts/verificar-estado-actual.mjs`). El recorte aterrizó, así que el guardián ya
   puede apretar.
3. **C8 y C9 de `test-orden` siguen en 0 y como reglas DURAS** (los clavó el PROMPT E):
   ninguna action habla con Supabase y ningún archivo pasa de 1 000 líneas.
4. El workflow ya no miente en su rótulo: dice **37 suites**, no 34.

---

## Pendiente

1. **El warning residual de `scripts/gen-panel.mjs`** (`MARCA`, línea 41). El prompt pide
   «lint en 0/0» **y** prohíbe tocar `gen-estado.mjs` y `gen-panel.mjs`. Se respetó la
   prohibición (es un límite explícito) y el warning queda documentado aquí y en la entrada
   del lint de `pendientes.json`. **Arreglarlo es una línea** (`void MARCA;` o quitar la
   constante, que no se usa): lo dejo señalado, no hecho, porque la prohibición es del
   propio prompt. El CI **no** se ve afectado: `npm run lint` sale 0.
2. **B4 del PROMPT-5 queda abierto** (partir los 4 módulos que mezclan decisión pura e I/O
   y los importa un `use client`). No era de este prompt: B3 lo cerró el E y B5 este F. La
   entrada `prompt5-parte-b` de `pendientes.json` ya lo dice.
3. **`docs/sistema/MATRIZ-UX.md`** conserva «sin `app/_borrador/`» como nota de su medición
   del 09-08: es cierto para esa fecha (historial), no un dato vivo.
4. Nada más: las cinco partes cerraron completas, sin dejar trabajo a medias.


