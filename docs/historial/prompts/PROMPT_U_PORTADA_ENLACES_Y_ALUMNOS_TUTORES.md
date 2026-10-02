# PROMPT U — Videos de carrera por enlace (YouTube/TikTok) con descripción · «Alumnos / Tutores» del directivo

> Diagnóstico hecho por Claude el 2026-10-01 sobre el código en `f45986d` y la
> base real (solo lectura). **Todo lo de «ESTADO ACTUAL» está verificado: no lo
> re-investigues.** Dos partes independientes; entrega A y B en **commits
> separados**, con `npm run test:ci` en verde antes de cada uno.
>
> El árbol de trabajo tiene cambios AJENOS a este prompt (solo fin de línea en
> `app/globals.css`, `app/perfil/page.tsx`, `lib/cloudinary/upload.ts`,
> `lib/escolar/types.ts`, `package.json`; una línea en blanco en
> `app/actions/escolar.ts`; `public/decoraciones-imagenes/.gitkeep`). **No los
> incluyas**: `git add` solo con los archivos de cada parte, nunca `-A`.

---

## PARTE A — Portada: el video de cada carrera es un ENLACE, y lleva un texto al lado

### OBJETIVO
En la portada pública (`/`), la banda de cada carrera («Oferta educativa»)
muestra el video con el **reproductor de YouTube o de TikTok** a partir de un
enlace, en vez de un archivo subido a Cloudinary. **La banda se adapta al
formato del video** (horizontal 16:9 o vertical 9:16). Junto al video va un
**texto lateral** que describe brevemente la carrera y su objetivo. Las dos
cosas se editan en «Configuración → Video e imágenes», que ya ven **directivo y
técnico**. Las imágenes del carrusel **no cambian**.

### ESTADO ACTUAL (verificado — no re-investigar)
- Portada: `app/page.tsx` (Server Component, pública). Lee todo con
  `leerPortadaPublica` → `cargarPortada` (`lib/escolar/portada/portada.ts`). Si la
  lectura falla, pinta lo fijo (`CARRERAS_RESPALDO`, sin video).
- Hoy cada banda pinta `<video>` con `c.video.url` / `c.video.poster` (Cloudinary,
  `aVideo()` en `portada.ts:132`). Un video = fila `portada_medios` con
  `tipo='video'` y `carrera_id` (`supabase/crear-portada-medios.sql`).
- **Medido hoy en la base:** `portada_medios` tiene **2 filas, ambas `imagen`**
  (orden 1 y 2). **0 videos.** No hay nada que migrar.
- Carreras activas: `MECATRONICA` (`c250801e-…`) y `RH` (`3e08314f-…`).
- Reglas puras: `lib/escolar/portada/portada-puro.ts` (validarVideo, proporciones,
  `validarDestino`, ajustes de contacto…). Suite: `scripts/test-portada.mjs`.
- Panel: `app/components/portada-medios-panel.tsx` (452 líneas), bloque «Video por
  carrera» con `VideoCarreraTarjeta` y subida firmada a Cloudinary.
- Actions: `app/actions/portada.ts`, todas con `exigir("noticia.publicar")` (solo
  directivo y técnico). Esquemas de entrada: `lib/validacion/esquemas-puro.ts`
  §«Portada administrable».
- Consumidores del camino «video subido»: SOLO el panel, `cargarPortada` y
  `registrarMedio`/`eliminarMedio`. `medirVideo` (`lib/imagen/medir-archivo.ts`)
  solo lo usa el panel.
- No hay Content-Security-Policy en `next.config.ts` ni en `proxy.ts`: los
  `<iframe>` de YouTube y TikTok no necesitan configuración.
- Datos externos comprobados:
  - TikTok Embed Player oficial: `https://www.tiktok.com/player/v1/{id}`;
    parámetros 0/1, `rel` por defecto 1, `description` y `music_info` por defecto 0.
  - YouTube exige que el `<iframe>` envíe Referer (desde 2025, si no, «Error 153»):
    `referrerPolicy="strict-origin-when-cross-origin"` en el iframe.
  - oEmbed de YouTube (`https://www.youtube.com/oembed?format=json&url=…`): 200 si
    se puede insertar; **401 = el dueño desactivó la inserción**; 403/404 =
    privado o borrado. oEmbed de TikTok: `https://www.tiktok.com/oembed?url=…`
    (200 si existe y es público).

### DECISIONES TOMADAS (no las reabras)
1. **Tabla nueva `portada_carreras`**, una fila por carrera (SQL abajo, cópialo tal
   cual). NO se reutiliza `portada_medios`: su `public_id`/`version` son NOT NULL
   y su forma es la de un archivo de Cloudinary.
2. Se guarda la **URL canónica** del video y su **formato**. Plataforma e id NO se
   guardan: se derivan de la URL al leer con el puro (una sola fuente). El
   formato SÍ se guarda: la URL lo sugiere (Shorts y TikTok son verticales) y
   quien edita puede corregirlo.
3. **Un solo texto** por carrera (`descripcion`, máx. 600 caracteres, saltos de
   línea respetados). Vacío = sin texto.
4. Al guardar, el servidor **comprueba el video contra la plataforma** (oEmbed): si
   es privado, no existe o no permite insertarse, se rechaza con un mensaje que
   dice qué hacer. Es la misma regla de la portada desde el PROMPT M: lo que
   manda es la comprobación del servidor contra el recurso real.
5. El camino «video subido a Cloudinary» se **DESACTIVA** (no se borra — filosofía
   §14, precedente `lib/cloudinary/noticias.ts`): `validarDestino` rechaza
   `tipo: "video"`, la lectura deja de mirar filas `tipo='video'` y las piezas
   solo-video quedan `@deprecated`. Se retira en su propio cambio (pendiente
   nuevo, abajo).

### SQL — `supabase/crear-portada-carreras.sql` (copiar tal cual)

```sql
-- ============================================================================
-- PORTADA — la banda de cada carrera: su video (ENLACE de YouTube o TikTok) y
-- un texto que la describe.  Proyecto: mi-web-escolar (CETAC)
-- Ejecutar en: Supabase SQL Editor.  Fecha: 2026-10-01  ·  PROMPT U, Parte A
--
-- ADITIVO Y REVERSIBLE: una tabla nueva, IF NOT EXISTS. No toca portada_medios
-- ni carreras. Idempotente: se puede ejecutar dos veces.
--
-- Sustituye al video SUBIDO a Cloudinary (portada_medios.tipo = 'video'), que
-- el 2026-10-01 tenía 0 filas: no hay nada que migrar. Esa forma queda
-- desactivada en el código y se retira aparte.
--
-- Se guarda la URL CANÓNICA que produce `analizarEnlaceVideo` (portada-puro.ts);
-- plataforma e id se derivan de ella al leer, así que no se guardan dos veces.
-- El formato sí: lo sugiere la URL y quien edita puede corregirlo.
--
-- Los topes (500 y 600) son los de portada-puro.ts; test-portada.mjs comprueba
-- que coinciden. Si cambias uno, cambia el otro.
--
-- IDENTIDADES: carrera por carreras.id (R5); quien edita por PROFESORES.ID,
-- bigint sin FK, igual que portada_medios.subido_por.
-- RLS: permisiva, como el resto. Autoriza exigir("noticia.publicar").
-- ============================================================================

create table if not exists public.portada_carreras (
  carrera_id      uuid primary key references public.carreras(id) on delete cascade,
  video_url       text check (
                    video_url is null
                    or (char_length(video_url) <= 500
                        and video_url ~ '^https://www\.(youtube|tiktok)\.com/')),
  video_formato   text check (video_formato in ('horizontal', 'vertical')),
  descripcion     text check (descripcion is null or char_length(descripcion) between 1 and 600),
  actualizado_por bigint,
  updated_at      timestamptz not null default now(),
  -- Un video lleva siempre su formato, y un formato sin video no significa nada.
  constraint portada_carreras_video_completo check ((video_url is null) = (video_formato is null)),
  -- Una fila vacía no se guarda: se borra.
  constraint portada_carreras_no_vacia check (video_url is not null or descripcion is not null)
);

comment on table public.portada_carreras is
  'Portada pública: video (enlace de YouTube o TikTok) y descripción de cada carrera. PROMPT U, 2026-10-01.';

alter table public.portada_carreras enable row level security;
drop policy if exists portada_carreras_all on public.portada_carreras;
create policy portada_carreras_all on public.portada_carreras for all using (true) with check (true);

notify pgrst, 'reload schema';
```

El SQL lo ejecuta una PERSONA. **El código tiene que funcionar ANTES de que se
ejecute** (ver punto 4 de RESULTADO).

### RESULTADO ESPERADO

**1. Puro — `lib/escolar/portada/portada-puro.ts`** (añadir una sección
«Videos por enlace»; nada de I/O):
```ts
export type PlataformaVideo = "youtube" | "tiktok";
export type FormatoVideo = "horizontal" | "vertical";
export const PROPORCION_VIDEO: Readonly<Record<FormatoVideo, number>> = { horizontal: 16 / 9, vertical: 9 / 16 };
export const MAX_LARGO_ENLACE_VIDEO = 500;
export const MAX_LARGO_DESCRIPCION_CARRERA = 600;

export type EnlaceVideo = {
  plataforma: PlataformaVideo;
  id: string;
  urlCanonica: string;        // la que se guarda
  formatoSugerido: FormatoVideo;
};
export type AnalisisEnlace =
  | { tipo: "video"; enlace: EnlaceVideo }
  | { tipo: "corto-tiktok"; url: string }   // hay que resolverlo (I/O) y volver a analizar
  | { tipo: "error"; error: string };

export function analizarEnlaceVideo(texto: string): AnalisisEnlace;
export function urlInsercionVideo(plataforma: PlataformaVideo, id: string): string;
export function interpretarRespuestaOembed(plataforma: PlataformaVideo, status: number): Resultado;
```
Reglas de `analizarEnlaceVideo` (mensajes para la persona de dirección: qué pasa
y qué hacer):
- `trim`; vacío → error «Pega el enlace del video.»; más de
  `MAX_LARGO_ENLACE_VIDEO` → error. Sin esquema (`youtu.be/…`) se antepone
  `https://`. `new URL` que falla, o protocolo distinto de `http:`/`https:` → error
  «No es un enlace válido. Cópialo completo desde YouTube o TikTok.»
- Host en minúsculas, quitando SOLO un prefijo `www.` o `m.`. Comparación de host
  **EXACTA** (nunca `includes`/`endsWith`): `youtube.com.evil.com` y
  `evil.com/?u=youtube.com` son error.
- **YouTube** (`youtube.com`, `youtube-nocookie.com`, `youtu.be`): id con
  `^[A-Za-z0-9_-]{11}$`.
  - `youtu.be/ID` · `/watch?v=ID` · `/embed/ID` · `/live/ID` → horizontal,
    canónica `https://www.youtube.com/watch?v=ID`.
  - `/shorts/ID` → **vertical**, canónica `https://www.youtube.com/shorts/ID`.
  - Cualquier otra ruta (canal, lista sin `v`, búsqueda) → error «Ese enlace de
    YouTube no es de un video. Abre el video y copia su dirección.»
  - Parámetros extra (`si`, `t`, `list`, `feature`) se descartan.
- **TikTok** (`tiktok.com`): `/@usuario/video/ID` con id `^\d{15,22}$` y usuario
  `^[A-Za-z0-9._]{1,30}$` → **vertical**, canónica
  `https://www.tiktok.com/@usuario/video/ID`. `/@usuario/photo/ID` → error «Es una
  publicación de fotos, no un video.» `/t/CÓDIGO` → `corto-tiktok`.
  `vm.tiktok.com/CÓDIGO` y `vt.tiktok.com/CÓDIGO` (código `^[A-Za-z0-9]+$`) →
  `corto-tiktok` con la URL normalizada a `https://`. Otra ruta → error con la
  forma esperada (`tiktok.com/@cuenta/video/…`).
- Cualquier otro host → error «Solo se aceptan videos de YouTube o TikTok.»
- La propia canónica tiene que volver a analizarse a sí misma (la lectura lo hace).

`urlInsercionVideo`:
- youtube → `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`
- tiktok  → `https://www.tiktok.com/player/v1/${id}?rel=0&description=0&music_info=0`

`interpretarRespuestaOembed`: 200 → ok; 401 → «Ese video no permite insertarse
en otras páginas. En YouTube: Studio › Detalles › Mostrar más › «Permitir
insertar».» (en TikTok: «…activa “Permitir insertar” en la privacidad de la
cuenta»); 400/403/404 → «No se encontró ese video o es privado. Tiene que ser
público (o “no listado” en YouTube).»; cualquier otro (incluido `0` = sin red /
tiempo agotado) → «No se pudo comprobar el video ahora mismo. Inténtalo en un
momento.»

Desactivación del camino viejo (mismo archivo):
- `validarDestino({ tipo: "video", … })` → `mal("Los videos de carrera ya no se suben: pega su enlace de YouTube o TikTok en «Oferta educativa».")`.
- `@deprecated` con su alternativa en: `validarVideo`, `MedicionVideo`,
  `MAX_BYTES_VIDEO`, `RECOMENDADO_BYTES_VIDEO`, `MAX_DURACION_VIDEO_S`,
  `FORMATOS_VIDEO`, `PROPORCION.video`, `MEDIDAS.video`, `TRANSFORMACION.video`,
  `TRANSFORMACION.poster`; y `medirVideo` en `lib/imagen/medir-archivo.ts`. **No
  los borres.** Actualiza el comentario de cabecera del puro.

**2. I/O externo — `lib/oembed/oembed.ts`** (ORDEN §1: «API externa →
`lib/<servicio>/`»; `import "server-only"`; imports relativos con `.ts`):
- `resolverEnlaceCortoTikTok(url: string): Promise<string | null>` — `fetch(url, {
  redirect: "follow", signal: AbortSignal.timeout(5000) })`, devuelve `res.url`
  (la final) y descarta el cuerpo. `null` ante cualquier error. Solo se llama con
  lo que el puro clasificó como `corto-tiktok` (hosts ya filtrados: no es SSRF).
- `consultarOembed(plataforma, urlCanonica): Promise<number>` — GET al endpoint
  FIJO de cada plataforma con `encodeURIComponent(urlCanonica)`, timeout 5 s;
  devuelve el `status`, o `0` si falla la red. La interpretación es del puro.

**3. I/O de la portada — `lib/escolar/portada/portada.ts`**:
- `TABLA_PORTADA_CARRERAS = "portada_carreras"` en `lib/escolar/tables.ts` y en
  la lista de `lib/escolar/materia/tablas-sistema.ts` (C15).
- Tipos: `VideoCarrera = { plataforma; formato; urlCanonica; urlInsercion }`.
  `CarreraPortada` pasa a `{ id; clave; rotulo; video: VideoCarrera | null;
  descripcion: string | null }`. **Borra `aVideo` y `VideoPortada`**: son el modelo
  de lectura que se sustituye y sus consumidores se reescriben aquí mismo.
  `EstadoPortada` gana `faltaSqlCarreras: boolean`.
- `cargarPortada`: 4.ª consulta en el mismo `Promise.all`:
  `portada_carreras` → `carrera_id, video_url, video_formato, descripcion`. Ya **no**
  construye videos desde `portada_medios` (las filas `tipo='video'` se ignoran).
  Una `video_url` que el puro no reconozca → `console.warn` y `video: null`, nunca
  excepción (es una página pública). **Si el error es `PGRST205` (tabla aún sin
  crear) NO lanza**: carreras sin video ni texto y `faltaSqlCarreras: true`. Otro
  error en esa consulta → como las demás (`ERROR_BASE`).
- `guardarCarreraPortada(supabase, e: { carreraId; enlace; formato; descripcion },
  actualizadoPor)` → `Resultado<{ estado: EstadoPortada }>`:
  1. carrera existe y `activo` (la misma consulta que hoy hace `comprobarDestino`
     para video: extráela a una función y úsala desde los dos sitios).
  2. `enlace` vacío → sin video. Si no: `analizarEnlaceVideo`; si `corto-tiktok`
     → `resolverEnlaceCortoTikTok` y se analiza la URL final, que tiene que dar
     `video` (si no: «No se pudo leer ese enlace corto de TikTok. Ábrelo en el
     navegador y copia la dirección completa (…tiktok.com/@cuenta/video/…).»);
     luego `consultarOembed` + `interpretarRespuestaOembed`. Formato =
     `e.formato ?? enlace.formatoSugerido`.
  3. `descripcion` vacía → `null`.
  4. Sin video y sin texto → `delete` de la fila. Si no → `upsert({ carrera_id,
     video_url, video_formato, descripcion, actualizado_por, updated_at },
     { onConflict: "carrera_id" })` (C16: es la PK declarada en el `.sql`).
  5. `PGRST205` → «Falta ejecutar supabase/crear-portada-carreras.sql en el SQL
     Editor.» Devuelve `cargarPortada` actualizado.
- `registrarMedio`: deja un comentario en la rama de video («inalcanzable desde el
  PROMPT U: `validarDestino` rechaza `video`»). No la borres.

**4. Entrada y action**:
- `esquemaCarreraPortada(maxEnlace, maxDescripcion)` en `esquemas-puro.ts` (los
  números se INYECTAN, como `maxOrden`): `carreraId` uuid; `enlace` string
  `trim`/`maxLength(maxEnlace)` (vacío permitido); `formato`
  `opcional(picklist(["horizontal","vertical"]))`; `descripcion` string
  `trim`/`maxLength(maxDescripcion)` (vacío permitido).
- `actionGuardarCarreraPortada(entrada)` en `app/actions/portada.ts`:
  `exigir("noticia.publicar")` → `leerEntrada(esquemaCarreraPortada(MAX_LARGO_ENLACE_VIDEO, MAX_LARGO_DESCRIPCION_CARRERA), entrada)`
  → `guardarCarreraPortada(…, g.sesion?.profesorId ?? null)`. Mismo try/catch que
  las demás. Solo funciones async exportadas (C14).

**5. Pieza visual compartida — `app/components/ui/video-incrustado.tsx`** (sin
`"use client"`: la usan la portada, que es de servidor, y el panel):
```tsx
<div className={vertical ? "relative aspect-[9/16] w-full max-w-[340px] …" : "relative aspect-video w-full …"}>
  <iframe src={src} title={titulo} loading="lazy"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
    allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
    className="absolute inset-0 h-full w-full border-0" />
</div>
```
Props: `src`, `formato: FormatoVideo`, `titulo`, `className?`. No importa nada de
dominio salvo `import type { FormatoVideo }`.

**6. Portada — `app/page.tsx`**. Cada banda (`#oferta`):
- Título como hoy. Debajo, según lo que haya:
  | Hay video | Hay texto | Disposición |
  |---|---|---|
  | horizontal | sí | `lg`: dos columnas, video ~3/5 y texto ~2/5; móvil: video y debajo texto |
  | vertical | sí | `lg`: video de ancho fijo (máx. 340 px) y el texto ocupa el resto; móvil: video centrado y debajo texto |
  | horizontal | no | como hoy (`lg:w-[72%]`) |
  | vertical | no | video centrado, máx. 340 px |
  | no | sí | solo texto, `max-w-3xl` |
  | no | no | solo el título (como hoy) |
- En `lg`, las bandas **alternan el lado**: índice par video a la izquierda, impar
  a la derecha (`lg:flex-row-reverse`), igual que alternan los azules.
- Texto: `whitespace-pre-line`, `text-base sm:text-lg leading-relaxed`, centrado en
  vertical respecto al video. `titulo` del iframe: `Video de ${c.rotulo}`.
- `CARRERAS_RESPALDO` añade `descripcion: null`. El comentario de cabecera se
  actualiza (ya no es «un video subido»).

**7. Panel — `portada-medios-panel.tsx`**. El bloque «Video por carrera» pasa a
**«Oferta educativa»**; `VideoCarreraTarjeta` se sustituye por
`OfertaCarreraTarjeta` **en el mismo archivo** (un archivo nuevo redeclararía sus
constantes de estilo — lección del PROMPT T). Por carrera:
- Campo «Enlace del video (YouTube o TikTok)» con la canónica guardada como valor
  inicial. Debajo, al escribir, lo que dice el puro EN EL NAVEGADOR:
  «YouTube · horizontal 16:9», «YouTube Shorts · vertical 9:16», «TikTok ·
  vertical 9:16», «Enlace corto de TikTok: se comprobará al guardar» o el error.
- Selector «Formato de la banda»: Horizontal 16:9 / Vertical 9:16, preseleccionado
  con `formatoSugerido` cada vez que cambia el enlace; se puede corregir.
- Vista previa con `VideoIncrustado` (la guardada, o la del enlace escrito si el
  puro lo reconoce).
- `<textarea>` «Descripción de la carrera y su objetivo», `maxLength` = la
  constante, contador «n / 600», placeholder con un ejemplo de 2 líneas.
- Botones «Guardar» y «Quitar video» (guarda con enlace vacío y conserva el
  texto). Ambos por `ejecutar(...)`, que ya maneja error y estado ocupado.
- Si `estado.faltaSqlCarreras`: aviso «Falta ejecutar
  `supabase/crear-portada-carreras.sql`…» y los botones deshabilitados.
- El texto de ayuda del bloque: el video tiene que ser público (o no listado en
  YouTube) y permitir insertarse; no consume el plan de Cloudinary.
- Quita del panel todo lo de subir video (accept de video, `medirVideo`,
  `validarVideo`, constantes de video).

**8. Diagnóstico — `scripts/diag-portada.mjs`** — **escríbelo PRIMERO y córrelo
antes de tocar nada más** (es la medición «antes» del CONTRATO). (`LEE`, cabecera QUÉ MIDE / QUÉ
ESCRIBE / CÓMO, mismo cargador de `.env.local` que `diag-seguimiento-medico.mjs`):
imágenes del carrusel (n y órdenes), filas `portada_medios.tipo='video'` (deben
ser 0; si hay, avisar de que el código ya no las muestra), si existe
`portada_carreras` (PGRST205), y por carrera activa: enlace, formato, largo del
texto y si la `video_url` tiene la forma canónica. Fila en `scripts/README.md`
(C10) con la medición de hoy: **2 imágenes, 0 videos, `portada_carreras` sin
crear**.

**9. Pendientes** (`docs/sistema/pendientes.json`) — **regenera
`node scripts/gen-rumbo.mjs` en el MISMO paso en que lo editas**:
- `sql-portada-carreras` · riesgo medio · persona ejecuta el `.sql` · verificar
  `node scripts/diag-portada.mjs` · «sin él, la portada se ve como hoy pero no se
  pueden guardar enlaces ni textos».
- `retirar-video-cloudinary-portada` · riesgo bajo · agente, en su propio cambio ·
  verificar `node scripts/diag-portada.mjs` (0 filas `video`) · «borrar lo marcado
  `@deprecated` en el PROMPT U».

### REGLAS
- Toda regla de enlace (qué se acepta, canónica, formato, mensajes) vive SOLO en
  el puro; navegador y servidor la importan de ahí. El panel no tiene regex.
- `lib/` sin alias `@/` y con extensión `.ts` (C1, C13).
- No toques el carrusel ni los ajustes de contacto.

### SEGURIDAD
- Autoriza `exigir("noticia.publicar")`; ninguna capacidad nueva.
- La URL del navegador nunca se usa tal cual: el `src` del iframe sale SIEMPRE de
  `urlInsercionVideo(plataforma, id)` con un id que pasó su regex. Eso cierra
  `javascript:` y hosts falsos. Pon esos casos en la suite.
- `fetch` del servidor solo a: los dos endpoints oEmbed fijos y hosts de TikTok que
  el puro ya aceptó como enlace corto.

### RENDIMIENTO
- iframes con `loading="lazy"`: la portada no carga nada de YouTube/TikTok hasta
  acercarse a la banda. La comprobación oEmbed solo ocurre al guardar, nunca al
  pintar la portada.

### VALIDACIÓN
- `scripts/test-portada.mjs`, casos nuevos: cada forma de YouTube aceptada (con
  `si=`, `t=`, sin `https://`, `m.`, `http:` → canónica `https`); Shorts →
  vertical; id de 10 y 12 caracteres → error; canal y lista → error; TikTok
  completo con query → canónica y vertical; foto → error; `vm.`/`vt.`/`/t/` →
  `corto-tiktok`; `youtube.com.evil.com`, `evil.com/?u=youtube.com`, `vimeo.com`,
  `javascript:alert(1)`, vacío, 501 caracteres → error; toda canónica se
  re-analiza igual; `urlInsercionVideo` exacta para las dos; 
  `interpretarRespuestaOembed` con 200, 401, 404, 403, 400, 500 y 0;
  `validarDestino` de video ahora rechaza; y que `supabase/crear-portada-carreras.sql`
  contiene `<= ${MAX_LARGO_ENLACE_VIDEO}` y `between 1 and ${MAX_LARGO_DESCRIPCION_CARRERA}`
  (lee el archivo). Actualiza el total de verificaciones en `scripts/README.md`.
- `npm run gen:matriz` (action nueva) · `node scripts/test-orden.mjs` ·
  `npm run test:ci` (incluye build).
- **Navegador, sin sesión** (la portada es pública): con el SQL SIN ejecutar, `/`
  se ve igual que antes, con su carrusel (prueba de que `PGRST205` no la rompe).
  Lo demás (guardar enlaces) exige el SQL y la sesión de directivo o técnico: no
  lo des por verificado; dilo en el informe.
- `ESTADO-ACTUAL.md` §1: «carrusel, videos por carrera y contactos» → «carrusel,
  el video de cada carrera (enlace de YouTube o TikTok) con su descripción, y
  contactos». Edita esa línea; no añadas otra (el archivo está en 149 de ~150).

---

## PARTE B — Directivo: «Alumnos / Tutores» abre el perfil de cualquier alumno

### OBJETIVO
En Administración escolar › **Alumnos / Tutores**, el directivo busca a cualquier
alumno (nombre o CURP) y consulta de él: **Información personal** (con su tutor),
**Seguimiento médico**, **Reportes** y **Citas**. **Nada de asistencias ni de
calificaciones.**

### ESTADO ACTUAL (verificado — no re-investigar)
- El hueco existe: `lib/navegacion/mapa-navegacion.ts:243`
  `act("alumnos-tutores", "Alumnos / Tutores")` **sin modos**;
  `contenido-directivo.ts` lo empareja con la pieza `"alumnos-tutores"`, y
  `contenido-directivo-oceano.tsx` solo pinta un `<Aviso>` de «falta».
- **El modelo ya está resuelto para Administración escolar** y se reutiliza
  entero (R6 — no hagas una segunda versión):
  - buscador `app/components/oceano/buscador-expediente-oceano.tsx` →
    `actionBuscarAlumnosExpediente` (exige **`alumno.ver_expediente`**, que hoy
    SOLO tiene `administracion`);
  - elegir = `router.replace("/oceano?alumno=CURP")`; `app/oceano/page.tsx` llama a
    `actionObtenerPerfilAlumno(curp)` (exige `alumno.ver_perfil`, que el directivo
    YA tiene) y `resolverAccesoAlumno` ya da al directivo **cualquier** alumno con
    `puedeLeer` y `puedeEditarDatosPersonales` en `true`;
  - el expediente se pinta con las MISMAS piezas del alumno
    (`ContenidoAlumnoOceano`): `perfil-informacion-personal` (foto, identidad,
    número de control, campos personales, **tutor principal**, comentario,
    etiquetas) y `perfil-seguimiento-medico` (campos + historial; el historial ya
    acepta `editor_rol = 'directivo'`).
- Reportes de un alumno: `AdministracionPanel pantalla="reportes"` con la prop
  `alumno` ya lista los del alumno (con «Ver todos» y «Anular») — es lo que usa
  Administración en Trámites. Directivo tiene `reporte.ver/crear/anular`.
- Citas: `actionListarCitas` (`cita.gestionar`, solo directivo) lista **todas** las
  del ciclo; `listarCitas(supabase, periodoId, { curps })` ya filtra por CURP.
  `SesionesProgramadasPanel` NO sirve aquí: lista por alcance de alumno/tutor y
  ofrece «Solicitar cita».
- Trampa de colisión: el mapa del alumno tiene `materias/recursos` y el directivo
  también tiene la pestaña `materias` con `recursos`. Si `datosAlumno` llegara al
  shell con sesión de directivo, Materias › Recursos pintaría la pieza del
  alumno. Por eso Administración ya pasa `datosAlumno={null}` y lleva el
  expediente DENTRO de sus propios datos. Haz lo mismo.

### RESULTADO ESPERADO
1. **Permiso** (`lib/auth/permisos.ts`): añade `"alumno.ver_expediente"` al
   directivo, con comentario: «buscar a cualquier alumno en Alumnos / Tutores;
   sobre quién ya lo decidía `resolverAccesoAlumno` (a todos)». Es la ÚNICA
   capacidad que cambia. `docs/sistema/MATRIZ-PERMISOS.md`, fila
   `alumno.ver_expediente`: columna D a ✅ y el texto menciona Dirección.
   `scripts/test-permisos.mjs`: `ok(puede("directivo","alumno.ver_expediente"))`;
   la línea 221 (maestro, tutor y alumno no) sigue igual.
2. **Mapa**: `act("alumnos-tutores", "Alumnos / Tutores", ["Información personal",
   "Seguimiento médico", "Reportes", "Citas"])`. Y una función pura nueva
   `llevaBuscadorAlumno(rol, idPestana, idApartado): boolean` — administracion:
   `PESTANAS_CON_ALUMNO.includes(idPestana)` (como hoy); directivo: solo
   `administracion/alumnos-tutores`; resto: `false`. `PESTANAS_CON_ALUMNO` se queda.
3. **Emparejamiento** (`lib/navegacion/contenido-directivo.ts`), patrón de
   `vistaCitas`: constantes `MODO_INFO_PERSONAL`, `MODO_SEGUIMIENTO_MEDICO`,
   `MODO_REPORTES_ALUMNO`, `MODO_CITAS_ALUMNO` y
   ```ts
   export type VistaAlumnosTutores =
     | { tipo: "alumno"; pieza: Extract<PiezaAlumno, "perfil-informacion-personal" | "perfil-seguimiento-medico"> }
     | { tipo: "reportes" }
     | { tipo: "citas" };
   export function vistaAlumnosTutores(modo: string | null): VistaAlumnosTutores; // por IGUALDAD; null o desconocido → información personal
   ```
   (`import type { PiezaAlumno } from "./contenido-alumno.ts"`). Actualiza la
   cabecera del archivo (dice que Alumnos / Tutores es el único activo).
4. **Action** `actionListarCitasDeAlumno(curp)` en `app/actions/administracion.ts`:
   `exigir("cita.gestionar")` → `resolverAccesoAlumno(supabase, g.sesion, curp)` →
   ciclo operativo → `listarCitas(supabase, periodoId, { curps: [acceso.curp] })`.
   `{ ok: true; citas: CitaRow[] } | Fallo`, try/catch como las vecinas.
5. **Panel** (`administracion-panel.tsx`): `Citas` recibe `alumno?: AlumnoElegido`;
   con alumno pinta `CitasDeAlumno`: TODAS sus citas (cualquier estado), título
   «Citas de {nombre}», vacío «Este alumno no tiene citas en el ciclo.». Extrae la
   tarjeta de cita de `ListaCitas` a `TarjetaCita({ c, onCambiar })` y úsala en las
   dos (mismos botones Aceptar / Rechazar / Marcar como finalizada).
   `AdministracionPanel` pasa `alumno` también a `Citas`.
6. **Página** (`app/oceano/page.tsx`): `const abreExpediente = puede(rol,
   "alumno.ver_expediente")` sustituye a `esAdministracion` en `curpConsulta`, en la
   condición de `perfil` y en `datosAlumno={abreExpediente ? null : datosAlumno}`.
   `datosDirectivo` = `{ materias, alumno: datosAlumno }`.
7. **Shell** (`shell-oceano.tsx`): el buscador se monta con
   `llevaBuscadorAlumno(rol, activa.id, activo?.id ?? "")`; `seleccionado` sale de
   `datosAdministracion?.alumno ?? datosDirectivo?.alumno`. Nada más cambia.
8. **Contenido** (`contenido-directivo-oceano.tsx`): `DatosDirectivoOceano.alumno:
   DatosAlumnoOceano | null`. Rama `alumnos-tutores`: sin alumno →
   `AvisoBuscarAlumno`; con alumno → según `vistaAlumnosTutores(modo)`:
   `ContenidoAlumnoOceano` (`permitirJustificacion={false}`), o
   `AdministracionPanel pantalla="reportes" modo="Reportes" alumno={{curp,nombre}}`,
   o `AdministracionPanel pantalla="citas" modo={null} alumno={{curp,nombre}}`.
   Borra el `<Aviso>` de «falta» y su comentario.
9. **C11**: `AvisoBuscarAlumno` se mueve a `buscador-expediente-oceano.tsx`
   (exportada) y la importan los dos contenidos. No la declares dos veces.

### REGLAS
- Cero pantallas nuevas de datos personales o médicos: son las piezas del alumno.
- Ninguna vista de este apartado puede llegar a `perfil-registro-calificaciones`,
  `materias-calificacion`, `asistencia-tabular`, `calendario-asistencia` ni a
  Notificaciones › Justificaciones.
- La UI no pregunta por el rol: `page.tsx` usa `puede()`, el shell usa el mapa.

### SEGURIDAD
- La CURP viaja por la URL: la barrera es `resolverAccesoAlumno` en cada action
  (perfil, historial médico, citas). Nunca filtres solo en el cliente.
- `actionListarCitasDeAlumno` con `cita.gestionar`: solo directivo.
- Efecto consciente: el directivo EDITA información personal y seguimiento médico
  desde aquí, porque ya tenía `alumno.editar_datos_personales` y
  `resolverAccesoAlumno` ya se lo concede (igual que la pantalla vieja
  `/directivo`). El historial médico lo firma como «Dirección».

### VALIDACIÓN
- `scripts/test-rediseno-oceano.mjs`: los 4 modos del mapa === las 4 constantes y
  en ese orden; `vistaAlumnosTutores` de cada modo, de `null` y de uno inventado;
  ninguna vista devuelve una pieza prohibida (recorre los modos); las dos piezas
  `alumno` existen en `contenido-alumno.ts`; `llevaBuscadorAlumno` → directivo
  `true` solo en `administracion/alumnos-tutores` (`false` en
  `administracion/citas` y en `materias/recursos`), administracion `true` en
  `expediente/*` y `tramites/*`, alumno/tutor/maestro/técnico `false`; añade
  `alumnos-tutores` al bucle de la línea ~397 («ya opera», con pieza y modos).
- `npm run gen:matriz` · `npm run test:permisos` · `node scripts/test-orden.mjs` ·
  `npm run test:ci`.
- Medición antes/después: `node scripts/diag-seguimiento-medico.mjs` (ediciones por
  rol; no debe cambiar por este prompt) y `node scripts/diag-agenda-citas.mjs`.
- `ESTADO-ACTUAL.md` §4, línea «Reportes, citas, historial médico»: añade «Dirección
  los consulta por alumno en Alumnos / Tutores». Sin líneas nuevas.
- No verificable por un agente: entrar con sesión de directivo. Dilo.

---

### INFORME
`docs/historial/informes/INFORME-PROMPT-U.md`, por parte: archivos tocados,
casos de suite antes/después, salida de `npm run test:ci`, medición antes/después,
lo que NO pudiste verificar (sesión real; enlaces reales tras el SQL) y lo que
marcaste `@deprecated`.

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
