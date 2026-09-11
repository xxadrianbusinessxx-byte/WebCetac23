# MATRIZ-UX — dónde vive cada decisión visual

Describe el **presente**, medido sobre el código (`docs/sistema/`, no normativo).
Responde una sola pregunta: **«quiero cambiar tal cosa de la apariencia, ¿qué archivo
toco y a qué más afecta?»**

- **Última medición:** 2026-09-08, sobre `app/**/*.tsx` (53 archivos, 13 100 líneas,
  sin `app/_borrador/`).
- **Hermano normativo:** `docs/normativo/ORDEN.md` §1 (dónde va un archivo nuevo).
- **Hermano funcional:** `docs/sistema/MAPA-DEL-SISTEMA.md` (síntoma → archivo).

> **Regla de mantenimiento.** Este archivo se actualiza **en el mismo cambio** que lo
> vuelve falso. Si tocas un color, un radio, una sombra o mueves una zona de la
> pantalla y no actualizas la fila correspondiente, el cambio está incompleto
> (`docs/normativo/CONTRATO-DE-CAMBIO.md`).

---

## 0. Cómo se usa

| Quiero… | Voy a |
|---|---|
| Pedir un cambio de apariencia | §6 — copio la fila y el `grep` de alcance al prompt |
| Saber dónde está una zona de la pantalla | §3 — mapa de rutas |
| Saber qué valor usa hoy un color / radio / sombra | §4 — tokens medidos |
| Reutilizar una pieza en vez de inventarla | §5 — catálogo de piezas |
| Entender por qué un cambio «no se aplica en todos lados» | §7 — deuda medida |
| Registrar lo que acabo de cambiar | §10 — bitácora |

**Hecho central que explica casi todo lo demás:** hoy **no existe capa de tokens**.
Las decisiones visuales viven como clases Tailwind escritas a mano dentro de cada
`.tsx` (unas 10 195 clases utilitarias, 966 valores arbitrarios `[...]` de 97 formas distintas). El único
sitio con variables reales es `app/globals.css` (`:root`), y solo cubre el **fondo** y
la **barra de navegación** — nada de lo que hay dentro de los paneles. Por eso
«cambiar el azul de los botones» hoy son N archivos y no uno.

---

## 1. Estado del sistema visual (cifras de hoy)

| Medida | Valor | Lectura |
|---|---|---|
| Archivos `.tsx` de UI | 53 | — |
| `className=` escritos | 1 565 | — |
| Clases utilitarias | ~10 195 | — |
| Valores arbitrarios `[...]` en `className` | 966 (97 distintos) | cada forma distinta es una decisión sin nombre |
| Variables CSS declaradas | 23 (`app/globals.css` `:root`) | todas de fondo/nav |
| Radios distintos | 13 | §4.3 |
| Sombras `shadow-[...]` distintas | 40 | §4.4 (7 concentran el grueso) |
| Tamaños de texto distintos | 12 | §4.5 |
| Opacidades de blanco (`bg-white/NN`) | 16 | §4.2 |
| Opacidades de borde (`border-white/NN`) | 10 | §4.2 |
| Piezas duplicadas a mano | 5 nombres, 25 copias | §5.2 / §7 |
| Archivos con `style={{...}}` inline | 6 | posiciones de decoración, no color |
| `focus:` / `focus-visible:` | 101 / 11 | §8 |

---

## 2. Las capas (orden de apilado)

Todo lo visual se apila en este orden. Cambiar una capa **no** debería obligar a tocar
otra; hoy se cumple.

| # | Capa | Archivo | Clase / marca | z |
|---|---|---|---|---|
| 1 | Fondo vivo (7 subcapas: base, luz, glows, ribbons, sheen, burbujas, viñeta) | `app/components/ui/decoracion-fondo.tsx` + `app/globals.css` (bloque C4.27) | `.app-bg-*` | `z-0`, `fixed` |
| 2 | Shell de contenido (crea el stacking context) | `app/components/ui/frutiger-backdrop.tsx` | `relative isolate z-[1]` | `z-[1]` |
| 3 | Contenedor de página (ancho, padding, rejilla) | cada `*-client.tsx` / `page.tsx` | `relative z-10 mx-auto …` | `z-10` |
| 4 | Paneles glass y sus piezas | `app/components/*` | §5 | — |
| 5 | Barra de navegación (sticky, full-width) | `app/components/ui/barra-navegacion.tsx` + `.app-nav-bar*` en `globals.css` | `.app-nav-bar` | `z-40` |
| 6 | Pantalla de cambio forzado de clave (sustituye TODO) | `app/components/cambio-clave-forzado.tsx`, montada en `app/layout.tsx` | — | — |
| 7 | Diálogos / overlays | inline en los paneles que los tienen | 2 usos | `z-50` |

**Montaje único:** `app/layout.tsx` monta las capas 1, 5 y 6 una sola vez para todas
las rutas. Ninguna página debe volver a montarlas.

**La barra no se muestra en `/` ni en `/login`** (primera línea del componente en
`barra-navegacion.tsx`), haya o no sesión.

---

## 3. Mapa de rutas — cómo está dividida la UX

Contenedor **estándar** (7 de 8 rutas, idéntico carácter por carácter):

```
relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8
```

| Ruta | Server | Client (líneas) | Contenedor | Zonas / piezas propias |
|---|---|---|---|---|
| `/` | `app/page.tsx` (todo) | `home-login-form.tsx` | **excepción:** `max-w-6xl` / `lg:max-w-7xl` + rejilla `lg:grid-cols-12` (3 · 5 · 4) | barra decorativa superior · `GlassShell` · `SectionPill` · `PanelTab` decorativo · `alumnos-estrella` · `eventos-inicio`. **Sin barra de navegación.** |
| `/login` | `app/login/page.tsx` | — | — | `redirect("/")`; no pinta nada |
| `/perfil` | `perfil/page.tsx` | `perfil-client.tsx` (822) | estándar (+ variante centrada `items-center justify-center` para el estado vacío) | 4 pestañas `MainTabButton`: materia · estatus · comentarios · boleta. `BubblePill`, `materia-selector`, `materia-tabla-vista`, `materia-calificaciones-alumno`, `calendario-asistencia-alumno`, `horario-alumno-resumen`, `etiquetas-dinamicas-panel` |
| `/profesor` | `profesor/page.tsx` | `profesor-client.tsx` (301) | estándar | `GreyActionPill`, `buscador-alumno-profesor`, `asistencias-panel`, `materia-selector`, `materia-tabla-vista`, `materia-mapeo-columnas` |
| `/directivo` | `directivo/page.tsx` | `directivo-client.tsx` (606) | estándar | `PanelTab`, `GreyActionPill`, `PreviewPanel`, 3 `<section>`, `justificaciones-admin`, `materias-config-panel`, `profesores-credenciales-panel`, `materia-*` |
| `/configuracion` | `configuracion/page.tsx` | `configuracion-client.tsx` (938) | estándar **+ 5 envoltorios repetidos** `mx-auto max-w-5xl px-4 pb-4 …` inyectados desde el server | `ciclo-configurador/` (7 pasos), `tutores-panel`, `asignaciones-admin`, `baja-roster-panel`, `deshacer-paso-panel`, `materias-config-panel`, `profesores-credenciales-panel` |
| `/documentos` | `documentos/page.tsx` | `documentos-client.tsx` (57) | estándar | todo vive en `documentos-panel.tsx` (700 líneas) |
| `/tutor` | `tutor/page.tsx` | `tutor-client.tsx` (596) | estándar | 4 pestañas `MainTabButton`: datos · alumnos · asistencia · mensajes. `BubblePill`, `GreyActionPill`, `calendario-asistencia-alumno`, `horario-alumno-resumen` |

### Quién ve qué en la barra (`ui/barra-navegacion.tsx`)

| Rol | Hogar (pill 1) | Pills adicionales |
|---|---|---|
| alumno | `/perfil` | — |
| maestro | `/profesor` | `/documentos` (solo si además tiene algún permiso otorgado) |
| directivo | `/directivo` | `/documentos`, `/configuracion` (mientras conserve `ciclo.crear`) |
| técnico | `/configuracion` (rotulado «Técnico») | `/documentos` |
| tutor | `/tutor` + `/tutor?tab=alumnos` («Alumno») | — |

La barra decide por **capacidad** (`puede()`), no por rol: un pill visible que el
servidor rechaza es un bug (`docs/sistema/MATRIZ-PERMISOS.md`).

### Árbol de uso de componentes

```
layout.tsx ─ decoracion-fondo · barra-navegacion ─ glossy-nav-pill · cambio-clave-forzado · web-vitals
page.tsx (/) ─ alumnos-estrella ─ glossy-person-icon · eventos-inicio · home-login-form
perfil ─ materia-selector · materia-tabla-vista · materia-calificaciones-alumno
        · calendario-asistencia-alumno · horario-alumno-resumen · etiquetas-dinamicas-panel
profesor ─ buscador-alumno-profesor ─ (calendario-asistencia-alumno · horario-alumno-resumen)
          · asistencias-panel · materia-mapeo-columnas ─ materia-calificaciones-alumno
directivo ─ justificaciones-admin · materias-config-panel ─ aliases-volumen-panel
           · profesores-credenciales-panel · materia-*
configuracion ─ ciclo-configurador/ ─ paso-{datos,academico,alumnos,horario,calendario,evaluacion,validacion}
                                       └ paso-horario ─ horario-escolar-panel
                                       └ paso-calendario ─ calendario-escolar-panel
               · tutores-panel · asignaciones-admin · baja-roster-panel · deshacer-paso-panel
documentos ─ documentos-panel
tutor ─ calendario-asistencia-alumno · horario-alumno-resumen
```

`frutiger-backdrop` y `glossy-person-icon` los usan **8 archivos cada uno**: son las
dos piezas realmente compartidas del sistema.

---

## 4. Tokens — los valores que hoy existen

> Ninguno de estos valores tiene nombre en el código todavía (salvo los del fondo).
> La columna «dónde se cambia» dice la verdad de hoy, no el ideal.

### 4.1 Color

**Familias usadas** (ocurrencias en `bg-/text-/border-/ring-/from-/via-/to-`):

| Familia | Usos | Papel real en el producto |
|---|---|---|
| `slate` | 627 | texto secundario + **todos los botones neutros** (gradiente 400→600) |
| `sky` | 529 | identidad de marca: títulos, acciones primarias, foco |
| `emerald` | 186 | éxito / confirmación / estado «bien» |
| `red` | 144 | error / destructivo |
| `amber` | 124 | aviso / pendiente |
| `rose` | 44 | error alternativo — **duplica el papel de `red`** |
| `indigo`, `violet`, `teal`, `orange` | 92 | usos sueltos sin papel definido |

**Superficies de mensaje** (patrón `border-X-N/NN bg-X-N`):

| Tono | Receta más usada | Variantes distintas hoy |
|---|---|---|
| Éxito | `border-emerald-400/50 bg-emerald-100` | 11 |
| Aviso | `border-amber-400/50 bg-amber-100` | 13 |
| Error | `border-red-200 bg-red-50` | 7 (+ 44 usos de `rose`) |

**Tonos de texto más usados:** `text-sky-900` (160) · `text-slate-600` (123) ·
`text-slate-700` (84) · `text-slate-800` (50, es el color base del `<body>`) ·
`text-emerald-900` (39) · `text-amber-900` (27).

**Dónde se cambia hoy:** en cada `.tsx`. No hay archivo de paleta.
**Lo único centralizado:** las variables de fondo en `app/globals.css` `:root`
(`--app-bg-base #0a2242`, `--app-bg-secondary #0e2c52`, `--app-bg-deep #061729`,
`--app-bg-glow #38bdf8`, `--app-bg-glow-aqua #67e8f9`, `--app-bg-glow-cyan #22d3ee`,
`--app-bg-glow-teal #14b8a6`, `--app-bg-glow-blue #3b82f6`) y la paleta del icono de
persona en `ui/glossy-person-icon.tsx` (`PALETAS`: masculino `#7dd3fc/#38bdf8/#0369a1`,
femenino `#f9a8d4/#ec4899/#be185d`).

### 4.2 Superficie glass

| Decisión | Valores en uso | Canónico de facto |
|---|---|---|
| Relleno | `bg-white/` 80 (38), 70 (28), 90 (26), 60 (21), 50 (20) + 11 valores más | `bg-white/80` |
| Borde | `border-white/` 70 (136), 55 (68), 60 (51) + 7 más | `border-white/70` |
| Desenfoque | `backdrop-blur-md` (77), `-sm` (26), `-xl` (26) | `backdrop-blur-md` |
| Halo del panel | `shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)]` (20) | ese |

Receta de panel grande (`GlassShell` de `/`):
`rounded-[1.75rem] border border-white/60 bg-white/30 shadow-[0_8px_32px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150`

### 4.3 Radios

| Radio | Usos | Se usa para |
|---|---|---|
| `rounded-full` | 192 | pills, botones, chips, avatares |
| `rounded-xl` | 105 | campos, celdas, cajas pequeñas |
| `rounded-2xl` | 83 | sub-paneles |
| `rounded-3xl` | 74 | paneles |
| `rounded-[2rem]` | 31 | paneles grandes |
| `rounded-lg` | 19 | residual |
| `rounded-[1.5rem]` (13) · `[1.75rem]` (8) · `[1.35rem]` (3) · `[1.25rem]` (1) | 25 | **cuatro radios a medida para el mismo papel que `rounded-3xl`/`[2rem]`** |
| `rounded-b` · `rounded-t` · `rounded-tl` | 25 | pestañas y bordes parciales |

**La forma de los botones es `rounded-full` en todo el sistema.** Cambiarla a
rectangular o suave es un cambio de una línea **por pieza** (§5), no global.

### 4.4 Sombras

40 sombras arbitrarias distintas; siete cubren el grueso:

| Sombra | Usos | Papel |
|---|---|---|
| `inset_0_2px_0_rgba(255,255,255,0.35)` | 58 | brillo superior de pill/botón |
| `inset_0_2px_0_rgba(255,255,255,0.5)` | 52 | brillo superior de superficie clara |
| `inset_0_2px_0_rgba(255,255,255,0.6)` | 20 | idem, más marcado |
| `0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)` | 20 | halo azul de panel |
| `inset_0_1px_0_rgba(255,255,255,0.95)` | 18 | línea de luz de campo |
| `inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)` | 14 | botón con elevación |
| `inset_0_3px_12px_rgba(0,0,0,0.06)` | 11 | hundido (zonas de lista) |

Las 33 restantes tienen entre 1 y 7 usos: son el ruido a consolidar (§7).

### 4.5 Tipografía

- **Fuente:** Nunito (`next/font/google`, pesos 400/500/600/700/800), declarada en
  `app/layout.tsx` como `--font-nunito` y expuesta a Tailwind con
  `@theme inline { --font-sans: var(--font-nunito) }` en `globals.css`.
- **Color base:** `text-slate-800` en el `<body>` (`app/layout.tsx`).

| Tamaño | Usos | Papel |
|---|---|---|
| `text-[10px]` | 269 | rótulos de pill, etiquetas, cabeceras de tabla |
| `text-xs` | 239 | texto de panel |
| `text-[11px]` | 170 | rótulo de botón |
| `text-sm` | 64 | texto normal / pill de navegación |
| `text-[9px]` (17) · `text-[8px]` (3) | 20 | micro-rótulos — límite de legibilidad |
| `text-lg` (8) · `text-xl` (7) · `text-2xl` (1) | 16 | los únicos títulos grandes de todo el portal |

**Diagnóstico de producto:** más del 60 % del texto mide 10–11 px y solo 16 elementos
en todo el sistema pasan de 18 px. La escala está comprimida hacia abajo: no hay
jerarquía tipográfica, la jerarquía la llevan el color y la forma de la pill.

Rótulos: casi todo botón/pill es `font-extrabold uppercase tracking-wide` (o
`tracking-wider` / `tracking-widest` en los tres tamaños de pill).

### 4.6 Espaciado y contenedor

| Decisión | Valor | Dónde |
|---|---|---|
| Ancho de página | `max-w-5xl` → `lg:max-w-6xl` | 7 rutas |
| Ancho de `/` | `max-w-6xl` → `lg:max-w-7xl` | `app/page.tsx` |
| Padding lateral | `px-4 sm:px-6 lg:px-8` | todas |
| Padding superior | `pt-6 lg:pt-8` | todas |
| Padding inferior | `pb-24` | todas (deja aire bajo el último panel) |
| Padding de panel | `p-5 sm:p-6` (paneles medianos) · `p-6 sm:p-8` (panel de login) | — |
| Separación entre paneles | `gap-5 lg:gap-6` | rejilla de `/` |

Puntos de corte: solo `sm:` (640 px) y `lg:` (1024 px). No hay `md:` ni `xl:`
sistemáticos.

### 4.7 Movimiento

Todo el movimiento vive en `app/globals.css`. Ningún componente anima con JS.

| Grupo | Keyframes | Duración |
|---|---|---|
| Fondo: respiración | `app-bg-breathe` | 24 s (`--app-bg-animation-duration`) |
| Fondo: glows | `app-bg-drift-a…d` | 25–37 s (`--app-bg-animation-duration-slow` ×0.85–1.25) |
| Fondo: ribbons | `app-bg-ribbon-a…d` | 26–36 s |
| Fondo: sheen | `app-bg-sheen` | 44 s |
| Fondo: burbujas | `app-bg-float` | 22–40 s, 12 burbujas (6 en ≤640 px) |
| Decoraciones | `decor-drift-a/b/c` | según elemento |
| Interacción | `transition hover:brightness-105` / `110` | por defecto de Tailwind |

`@media (prefers-reduced-motion: reduce)` desactiva **todas** las animaciones de fondo,
nav y decoración, y deja las burbujas estáticas a `opacity: 0.1`. Cualquier animación
nueva debe entrar en ese bloque.

---

## 5. Catálogo de piezas

Estado real: **`app/components/ui/` solo contiene 6 archivos**, y ninguno es un botón,
un panel ni un campo. Las piezas de interfaz están **definidas dentro de los archivos
que las usan** y copiadas a mano.

### 5.1 Piezas compartidas de verdad (`app/components/ui/`)

| Pieza | Archivo | La usan | Receta clave |
|---|---|---|---|
| `FrutigerBackdrop` | `ui/frutiger-backdrop.tsx` | 8 archivos | `relative isolate z-[1] min-h-dvh overflow-x-hidden font-sans` |
| `DecoracionFondo` | `ui/decoracion-fondo.tsx` | `layout.tsx` | 7 capas CSS + 12 burbujas con posición inline |
| `BarraNavegacionGlobal` | `ui/barra-navegacion.tsx` | `layout.tsx` | `.app-nav-bar*` en `globals.css` |
| `GlossyNavPill` | `ui/glossy-nav-pill.tsx` | `barra-navegacion` | `rounded-full`; activo `from-sky-400 via-sky-600 to-sky-800`, inactivo `from-sky-600 via-sky-800 to-sky-950`; brillo con pseudo-elemento `before:` |
| `GlossyPersonIcon` | `ui/glossy-person-icon.tsx` | 8 archivos | SVG con `PALETAS` por género |
| `WebVitals` | `ui/web-vitals.tsx` | `layout.tsx` | sin render |

### 5.2 Piezas duplicadas a mano (5 nombres, 25 copias)

| Pieza | Copias | Variantes | Dónde |
|---|---|---|---|
| `GreyActionPill` | **10** | 3 | `calendario-asistencia-alumno`, `calendario-escolar-panel`, `cambio-clave-forzado`, `documentos-panel`, `justificaciones-admin`, `tutores-panel`, `configuracion-client`, `directivo-client`, `profesor-client`, `tutor-client` |
| `PanelTab` | **8** | 3 | `calendario-asistencia-alumno`, `calendario-escolar-panel`, `documentos-panel`, `justificaciones-admin`, `tutores-panel`, `configuracion-client`, `directivo-client`, `page.tsx` |
| `PillButton` | **3** | 3 | `asistencias-panel`, `etiquetas-dinamicas-panel`, `horario-escolar-panel` |
| `MainTabButton` | **2** | 1 | `perfil-client`, `tutor-client` |
| `BubblePill` | **2** | 1 | `perfil-client`, `tutor-client` |

Las variantes ya divergieron:

- `GreyActionPill` — 8 copias idénticas; `profesor-client` solo cambia el orden de los
  atributos; **`cambio-clave-forzado` perdió la sombra exterior**
  (`,0_3px_10px_rgba(2,6,23,0.12)`): ese botón está visualmente más plano que los otros
  nueve.
- `PanelTab` — 6 idénticas, `documentos-panel` difiere solo en formato, y la de
  `app/page.tsx` **es otra cosa**: una barra decorativa azul sin `children`.
- `PillButton` — las tres divergen: `asistencias-panel` no acepta `type`,
  `horario-escolar-panel` usa `disabled:opacity-50` (las otras `60`), y
  `etiquetas-dinamicas-panel` añade una prop `tone: "sky" | "grey"` que las otras no
  tienen.

### 5.3 Recetas (el CSS literal de cada pieza)

| Pieza | Receta |
|---|---|
| **Botón neutro** (`GreyActionPill`) | `rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60` |
| **Botón primario** (`PillButton`) | igual, cambiando el gradiente por `from-sky-500 via-sky-600 to-sky-700` |
| **Rótulo de sección** (`PanelTab`) | `rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px]` |
| **Rótulo destacado** (`SectionPill`, solo `/`) | `rounded-full border border-white/70 bg-linear-to-b from-sky-200/90 via-sky-100/80 to-white/70 px-6 py-2 text-xs font-extrabold uppercase tracking-widest text-sky-900 shadow-[0_4px_16px_rgba(14,165,233,0.2),inset_0_1px_0_rgba(255,255,255,0.95)]` |
| **Dato en burbuja** (`BubblePill`) | `inline-flex items-center justify-center rounded-full border border-white/70 bg-white/88 px-3 py-2 text-[10px] font-bold uppercase leading-tight text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(14,165,233,0.12)] sm:text-xs` |
| **Pestaña** (`MainTabButton`) | base `min-w-0 flex-1 rounded-t-2xl border border-b-0 px-2 py-3 text-[10px] font-extrabold uppercase tracking-wide sm:px-4 sm:text-xs`; activa `border-sky-800/25 bg-white/92 text-sky-800`; inactiva `bg-slate-400/75 text-slate-700 translate-y-px` |
| **Pill de navegación** (`GlossyNavPill`) | `rounded-full border border-white/40 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider ring-1 ring-white/20 shadow-[inset_0_2px_0_rgba(255,255,255,0.4),inset_0_-2px_0_rgba(0,0,0,0.28),0_6px_18px_rgba(2,6,23,0.35)] sm:px-10` |
| **Campo compacto** (select/input) | `rounded-xl border border-white/70 bg-white/85 px-2 py-1.5 text-[10px] font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] outline-none focus:ring-2 focus:ring-sky-400/50` |
| **Campo ancho** | `w-full min-w-[7rem] rounded-xl border border-white/70 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-inner outline-none focus:border-sky-600 disabled:bg-white/50 disabled:text-slate-600` |
| **Sub-panel** | `rounded-2xl border border-white/55 bg-white/50 p-3` |
| **Mensaje éxito / aviso / error** | `border-emerald-400/50 bg-emerald-100` · `border-amber-400/50 bg-amber-100` · `border-red-200 bg-red-50` |

---

## 6. Matriz de cambio — «quiero cambiar X»

El `grep` de alcance se ejecuta **antes** de encargar el cambio, para saber cuántos
sitios toca. Todos son de solo lectura.

| Quiero cambiar… | Se toca hoy | Alcance | Riesgo |
|---|---|---|---|
| **Color/animación del fondo** | `app/globals.css` `:root` (`--app-bg-*`) | 1 archivo, global | bajo |
| **Intensidad del movimiento del fondo** | `--app-bg-animation-duration*` en `globals.css` | 1 archivo | bajo |
| **Quitar/mover burbujas** | `BURBUJAS` en `ui/decoracion-fondo.tsx` + `.app-bg-bubble` | 2 archivos | bajo |
| **Barra de navegación (altura, fondo, luz, logo)** | `.app-nav-bar*` en `globals.css` | 1 archivo | bajo |
| **Qué pills salen en la barra y para quién** | `ui/barra-navegacion.tsx` | 1 archivo — debe seguir a `puede()` | **alto**: un pill que el servidor rechaza es un bug |
| **Aspecto de los pills de la barra** | `ui/glossy-nav-pill.tsx` | 1 archivo | bajo |
| **Color de los botones primarios** | 3 copias de `PillButton` + gradientes sueltos | `grep -rn "from-sky-500 via-sky-600 to-sky-700" app --include=*.tsx` (7) | medio |
| **Color de los botones neutros** | 10 copias de `GreyActionPill` + rótulos `PanelTab` | `grep -rn "from-slate-400 via-slate-500 to-slate-600" app --include=*.tsx` (77) | medio |
| **Forma de los botones** (dejar de ser cápsula) | las 5 piezas de §5.2 | `grep -rn "rounded-full" app --include=*.tsx` (192; incluye avatares y chips) | medio |
| **Tamaño de la letra de los botones** | `text-[11px]` en las piezas de §5.2 | `grep -rn "text-\[11px\]" app --include=*.tsx` (170) | medio |
| **Legibilidad general del texto** | `text-[10px]`/`[9px]`/`[8px]` repartidos | `grep -rn "text-\[10px\]" app --include=*.tsx` (269) | **alto**: cambia todas las rejillas |
| **La fuente** | `Nunito` en `app/layout.tsx` + `--font-sans` en `globals.css` | 2 archivos, global | bajo |
| **Transparencia/blur de los paneles** | `bg-white/NN` + `backdrop-blur-*` repartidos | `grep -rn "backdrop-blur" app --include=*.tsx` (129) | medio |
| **Redondeo de los paneles** | `rounded-3xl` · `[2rem]` · `[1.75rem]` · `[1.5rem]` | 4 greps (§4.3) | medio |
| **Colores de éxito/aviso/error** | pares `border-X bg-X` en cada panel | `grep -rnE "bg-(emerald\|amber\|red\|rose)-[0-9]+" app --include=*.tsx` | medio |
| **Ancho de las páginas** | contenedor estándar en 7 clientes + 5 envoltorios de `/configuracion` | `grep -rn "max-w-5xl" app --include=*.tsx` (14) | bajo |
| **Reordenar zonas dentro de una ruta** | el `*-client.tsx` de esa ruta (§3) | 1 archivo | bajo |
| **Mover un panel de una ruta a otra** | quitar el import de un cliente, añadirlo en otro | 2 archivos (+ `ORDEN.md` §1 si cambia de carpeta) | medio |
| **Aspecto de los campos de formulario** | receta repetida en cada panel | `grep -rn "focus:ring-sky-400/50" app --include=*.tsx` | medio |
| **Aspecto de las pestañas** | `MainTabButton` ×2 (`perfil`, `tutor`) | 2 archivos | bajo |
| **La pantalla de cambio forzado de clave** | `components/cambio-clave-forzado.tsx` | 1 archivo | bajo |
| **La portada `/`** | `app/page.tsx` (rejilla 3·5·4 + 3 piezas locales) | 1 archivo | bajo |
| **Icono de persona / avatares** | `PALETAS` en `ui/glossy-person-icon.tsx` | 1 archivo, 8 consumidores | bajo |
| **Logo de la esquina** | `LOGO_ESQUINAS_ARCHIVO` en `lib/decoraciones/config.ts` + `npm run sync:decoraciones` | 1 archivo + el binario en `decoraciones imagenes/` | bajo |

---

## 7. Deuda de UX medida (2026-09-08)

No es opinión de estilo: son los puntos donde **un cambio visual no se propaga solo**.

| # | Deuda | Medida | Consecuencia |
|---|---|---|---|
| D1 | No hay capa de tokens | 23 variables CSS, todas de fondo | cambiar un color de marca = N archivos |
| D2 | 25 copias manuales de 5 piezas | §5.2 | 3 de esas piezas ya tienen variantes divergentes |
| D3 | 40 sombras distintas | 33 con ≤7 usos | ninguna «sombra del sistema» reconocible |
| D4 | 13 radios | 4 a medida para el mismo papel | esquinas visiblemente desiguales entre paneles |
| D5 | 16 opacidades de blanco + 10 de borde | §4.2 | los paneles no parecen del mismo material |
| D6 | Escala tipográfica comprimida | >60 % del texto a 10–11 px; 16 elementos >18 px | no hay jerarquía; se lee denso y plano |
| D7 | `red` y `rose` compiten para «error» | 144 vs 44 usos | el mismo estado se ve de dos colores |
| D8 | `app/components/ui/` no contiene piezas de interfaz | 6 archivos, ninguno botón/panel/campo | quien escribe un panel nuevo copia y pega |
| D9 | `/configuracion` repite el envoltorio de ancho 5 veces desde el server | `configuracion/page.tsx` | el ancho de esa ruta se cambia en 6 sitios |
| D10 | `focus-visible:` solo 11 usos frente a 101 `focus:` | — | el anillo de foco aparece también al hacer clic con ratón |
| D11 | Tema claro sobre fondo oscuro | 905 ocurrencias en 38 archivos (`diag-restyle-oceano.mjs`, 2026-09-10) | los paneles son glass CLARO (`bg-white/30`, `text-sky-900`) sobre un fondo navy; el diseño Océano los quiere oscuros, así que el rediseño toca los 38 archivos |

### Migración Océano (2026-09-10)

Rediseño visual completo sobre el archivo de Figma `CkEJzPJejUZLeByX7ErdWm`. **D11 es su
medida.** No es una deuda a saldar por separado: se salda *siendo* la migración.

**Línea base medida el 2026-09-10** (`node scripts/diag-restyle-oceano.mjs`):

| Fase | Alcance | Ocurrencias de tema claro |
|---|---|---|
| 1 | Tokens y shell global (5 roles) | 11 |
| 2 | Reubicar lo que funciona · alumno | 214 |
| 4 | Tutor | 51 |
| 5 | Profesor | 187 |
| 6 | Directivo | 76 |
| 7 | Técnico | 284 |
| — | Sin fase (incluye `documentos-panel`, que queda apagado) | 82 |
| | **Total** | **905** |

**Invariante de la migración:** cada fase debe **bajar** su cifra de «claro» y **subir** la
de `--oc-*`. Una fase que no mueve ninguna de las dos no tocó la superficie que decía tocar.

**Lo que la migración NO cambia:** ni un permiso (salvo la Fase 0, que es explícitamente un
cambio de matriz y va sola), ni un modelo de datos, ni la firma de ningún componente. Las
fases 2 y 5-7 son reubicación y estilo; las fases 3 y 4 añaden presentación sobre datos que
ya existen.

**Especificación completa** (gramática de tres niveles, paleta muestreada, registro de lo
desactivado y los ocho prompts): artefacto *Rediseño Océano*, fuera del repo.

### Plan de consolidación (PROPUESTA — aún NO ejecutada)

Cuatro fases independientes, cada una encargable por separado y verificable sin base de
datos. Ninguna cambia comportamiento: solo dónde vive el CSS.

| Fase | Qué hace | Contrato de aceptación |
|---|---|---|
| **F-UX1 — Piezas** | Crear `app/components/ui/pill.tsx` (`GreyActionPill`, `PillButton`, `PanelTab`, `BubblePill`) y `app/components/ui/tab.tsx` (`MainTabButton`); sustituir las 25 copias por imports. Canónica = la variante **con** sombra exterior. | `npx tsc --noEmit` y `next build` limpios; `grep -rc "^function GreyActionPill" app` = 0; capturas antes/después de `/perfil`, `/tutor` y `/documentos` sin diferencia salvo el botón de `cambio-clave-forzado`, que gana la sombra que le falta |
| **F-UX2 — Tokens** | Declarar en `globals.css` (`@theme`) los valores canónicos de §4.2/4.3/4.4 con nombre (`--surface-glass`, `--radius-panel`, `--shadow-pill`…) y usarlos desde las piezas de F-UX1 | ningún `.tsx` nuevo con `shadow-[...]`; el número de sombras distintas baja de 40 |
| **F-UX3 — Semántica** | Un solo tono de error (`red`, retirar `rose`), una sola receta por tono, un componente `Mensaje({tono})` | `grep -rc "rose-" app` = 0 |
| **F-UX4 — Jerarquía** | Subir la escala tipográfica (cuerpo mínimo 12 px, títulos reales de panel) y retirar `text-[8px]`/`[9px]` | ninguna clase `text-[8px]`/`text-[9px]`; revisión visual de las 8 rutas |

Orden obligatorio: **F-UX1 antes que F-UX2** (no tiene sentido dar nombre a un valor que
está copiado 25 veces). F-UX3 y F-UX4 son independientes entre sí.

---

## 8. Invariantes de UX (no se rompen sin decisión explícita)

1. **El fondo y la barra se montan una sola vez**, en `app/layout.tsx`. Ninguna página
   los vuelve a montar (regla de no duplicar fuentes, `REGLAS_NO_HACER.md`).
2. **`/` y `/login` no llevan barra de navegación.**
3. **Lo que la barra ofrece lo gobierna `puede()`**, la misma función del servidor.
4. **Toda animación nueva entra en `@media (prefers-reduced-motion: reduce)`.**
5. **El fondo es decorativo:** `aria-hidden` + `pointer-events-none`. No lleva contenido
   ni foco.
6. **Nada de `public/` a mano** para decoración: es salida de
   `npm run sync:decoraciones` (`ORDEN.md` §1).
7. **Un componente visual sin dominio va en `app/components/ui/`**, no dentro del
   archivo que lo usa (`ORDEN.md` §1). Las 25 copias de §5.2 son la deuda de haber
   incumplido esto, no un permiso para repetirlo.
8. **Objetivo táctil mínimo 44 px** en controles de uso frecuente. Hoy lo cumplen las
   pestañas y las opciones de `materia-selector` (mínimo 48 px, decisión tomada para
   evitar misclicks); las pills `px-4 py-2` se quedan en el límite.
9. **Texto blanco `font-extrabold` sobre los gradientes `slate-500` / `sky-600`**; no
   bajar el peso sin comprobar contraste.

---

## 9. Cómo se mantiene este documento

**Cuándo se actualiza:** en el mismo cambio que lo vuelve falso.

| Si el cambio… | Actualiza |
|---|---|
| Añade, mueve o quita una ruta o una zona | §3 |
| Añade un color, radio, sombra o tamaño nuevo | §4 (y explica por qué no valía uno existente) |
| Crea o consolida una pieza | §5 |
| Cambia dónde se toca algo | §6 |
| Salda o crea deuda | §7 y §1 |

**Avance de la migración Océano** (solo lectura, sin Supabase). Sustituye a contar
`grep` a mano y es el diagnóstico que exige el CONTRATO en las fases 1-7:

```bash
node scripts/diag-restyle-oceano.mjs            # todo, con desglose por fase
node scripts/diag-restyle-oceano.mjs --fase=2   # solo los archivos de una fase
node scripts/diag-restyle-oceano.mjs --json     # para comparar antes/después
```

**Cómo se re-miden las cifras de §1 y §4** (desde la raíz del repo, solo lectura, sin
Supabase):

```bash
grep -rhoE 'rounded-(\[[^]]*\]|[a-z0-9]+)' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE 'shadow-\[[^]]*\]' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE 'text-(\[[0-9]+px\]|xs|sm|base|lg|xl|2xl|3xl)' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE 'bg-white/[0-9]+' app --include=*.tsx | sort | uniq -c | sort -rn
grep -rhoE '\b(bg|text|border|ring|from|via|to)-[a-z]+-[0-9]{2,3}' app --include=*.tsx | sed -E 's/^[a-z]+-//; s/-[0-9]+$//' | sort | uniq -c | sort -rn
```

---

## 10. Bitácora

Append-only. Una línea por cambio visual aceptado: fecha · qué cambió · secciones
tocadas.

| Fecha | Cambio | Secciones |
|---|---|---|
| 2026-09-08 | Creación del documento. Primera medición completa del sistema visual. | todas |
| 2026-09-10 | Rediseño Océano: línea base medida (905 ocurrencias de tema claro en 38 archivos, 0 % migrado) y alta de `scripts/diag-restyle-oceano.mjs`. Sin cambios de código todavía. | §7, §9, §10 |
