# INFORME — PROMPT O · Portada administrable (4/4): la portada pública

**Fecha:** 2026-09-24 · **Rama:** `feature/portada-administrable` · **Ejecutado por:** Claude
(directamente desde el plan) · Frame: `things/figma-oceano/Pantalla de bienvenida.png`

## Qué pinta `/`

| Bloque | Origen |
|---|---|
| Barra: «Contacta con nosotros» + iconos · «CETAC 23 EL MARQUES» · «Inicia sesión» | iconos solo de los enlaces **configurados** (TikTok, WhatsApp, Facebook, correo → `mailto:`) |
| Hero | **carrusel** (`app/components/portada-carrusel.tsx`) si hay imágenes; si no, la **portada institucional** del frame: lema, Visión, Valores y el sello CETAC de fondo |
| «Conoce nuestra oferta educativa» | encima del hero, en el 25 % inferior, enlaza a `#oferta` |
| Una banda por carrera | rótulo (MECATRÓNICA, RECURSOS HUMANOS) + su video 16:9 si lo hay (`controls`, `preload="none"`, póster, `playsInline`) |
| Pie | Ubicación · Contactos (tel:, mailto:) · Redes sociales; una columna sin datos no se pinta |
| Logos | SEMS · DGETAyCM · SEP |

Todo lo administrable llega en **una** lectura, `leerPortadaPublica`. **«Alumnos estrella» y «Cree
en ti» se retiraron** de la portada; sus componentes y `actionAlumnosEstrella` siguen en el repo
hasta que se retiren aparte.

## El carrusel

- **Proporción:** 7:3 en escritorio. En teléfono, 4:5 **solo si todas** las imágenes tienen versión
  móvil. Si falta una, el carrusel entero se queda en 7:3 **con las de escritorio**: una 4:5
  metida en una caja 7:3 perdía arriba y abajo. **Lo detectó la prueba visual**, no estaba en el
  plan. En ese caso, en teléfono no caben el rótulo y los puntos: se ocultan los puntos y quedan
  las flechas.
- **Movimiento:** 6 s. Se detiene con el ratón encima, con el foco dentro y con
  `prefers-reduced-motion`, que además quita el fundido. Flechas, puntos y teclado (← →).
- `<img>` dentro de `<picture>`: Cloudinary ya entrega tamaño y formato. La primera imagen es
  `eager` con `fetchPriority="high"`; el resto `lazy`.

## Nunca se rompe

`leerPortadaPublica` va en `try/catch`. Si la base falla se pinta lo fijo: portada institucional,
las dos carreras sin video (de `ROTULOS_CARRERA`) y el pie con la dirección del frame.
**`unstable_rethrow`** va primero en el `catch`, porque la primera versión se tragaba la señal
interna de Next «esta ruta es dinámica». El build lo imprimía como error y la portada se habría
generado estática, sin datos. Se detectó en el build y ya no aparece.

## Tres decisiones sobre archivos

1. **El logo de Gemini era `CetacLogo.png` renombrado** (el mismo archivo, comprobado).
   `LOGO_ESQUINAS_ARCHIVO` apunta ahora a `CetacLogo.png`. Si no, `sync:decoraciones` lo habría
   purgado de `public/` y la barra de Océano se quedaba sin logo. Comprobado: el nuevo sirve 200 y
   ya nada referencia al viejo.
2. **`BACKGROUND.jpg` no se usa como fondo de respaldo:** es el fondo «Bliss» de Windows XP, no el
   del frame. El respaldo es el degradado navy (`--oc-bg`) con el sello en marca de agua, como el
   frame.
3. **El PNG de WhatsApp** mide 1600 × 1136 y el dibujo ocupa ~60 % del ancho: se escala 1,6 para
   que se vea del tamaño de los otros.

## Prueba visual, con datos reales y limpieza

Se sembraron, **con el mismo flujo que el panel** (firma → subida a Cloudinary → registro verificado
contra el archivo real), 3 imágenes con su versión móvil, un video 16:9 para Mecatrónica y cinco
enlaces. Build de producción servido en local:

| Caso | Resultado |
|---|---|
| Escritorio 1280 | igual al frame; carrusel 7:3; video 16:9; pie con los tres bloques y los logos |
| Teléfono 375 | carrusel **0,800 (4:5)** con los archivos `imagen_movil_`; video 1,778; sin scroll horizontal |
| Mixto (una sin móvil) | carrusel 2,333 en teléfono, **solo archivos de escritorio**, sin puntos |
| Navegación | siguiente, anterior (da la vuelta de la 1 a la 3), punto, tecla →; `aria-current` correcto |
| Video | fuente 200 `video/mp4;codecs=avc1`, póster 200 `image/jpeg` |
| Sin datos (estado real hoy) | portada institucional; sin iconos; el pie solo con Ubicación; escritorio y teléfono |

**Limpieza verificada:** 0 filas en `portada_medios`, **0 de 7 archivos de prueba vivos** en
Cloudinary, ajustes como estaban (solo `direccion`).

**No observado:** el avance automático. El navegador de pruebas tiene `prefers-reduced-motion`
activado, así que lo que se comprobó es la rama contraria: sin avance y sin fundido, como debe.

## De paso

`app/actions/carga-academica.ts` importaba `GrupoReconocimiento` sin usarlo. Era un resto del arreglo
de producción `dd3664e` y el único aviso de lint del repo; se quitó.

## Validación

`tsc` 0 · `eslint app lib` **0 avisos** · `test-orden` 14 reglas · `test:ci` (41/41 suites,
invariantes, rumbo, estado, docs) · `test:permisos` 573/0 y 176 acciones auditadas ·
`gen:matriz --check` · `build` sin errores y `/` dinámica. `MATRIZ-UX` §3 al día con la ruta `/`.
