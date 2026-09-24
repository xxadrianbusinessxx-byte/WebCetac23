# INFORME — PROMPT N · Portada administrable (3/4): el panel

**Fecha:** 2026-09-24 · **Rama:** `feature/portada-administrable` · **Ejecutado por:** Claude
(directamente desde el plan, sin documento de prompt para Cline)

## Dónde vive

Nueva pestaña **Configuración** para directivo y técnico —la MISMA `Pestana` compartida—, con un
apartado, **Video e imágenes**, que monta `app/components/portada-medios-panel.tsx`. Se enlaza por
`HUECOS` en `contenido-directivo.ts` y `contenido-tecnico.ts` (pieza `portada-medios`), igual que
el resto de piezas. El apartado apagado «Noticias» de Contenido **se quitó**: la portada lo
sustituye. `lib/cloudinary/noticias.ts` y `app/actions/noticias.ts` quedan marcados
`@deprecated`, **sin borrar** (R8).

## El panel — tres bloques

| Bloque | Qué hace |
|---|---|
| Carrusel | hasta 5 posiciones; cada una con su imagen de escritorio (7:3) y una **versión opcional para teléfono** (4:5); subir, reemplazar, quitar solo la móvil, eliminar, mover ↑/↓ |
| Videos | una tarjeta por carrera activa con su rótulo público; subir o reemplazar el video (16:9, ≤ 120 s) o quitarlo |
| Enlaces | TikTok, Facebook, WhatsApp, correo, teléfono y dirección; un campo vacío quita el enlace |

Cada subida enseña **las medidas ideales y mínimas** y la zona segura (el 25 % inferior lo tapa
el rótulo «Conoce nuestra oferta educativa»).

## Cómo sube un archivo

1. `lib/imagen/medir-archivo.ts` mide en el navegador y el panel aplica **las mismas reglas del
   puro** que el servidor: un archivo que no cumple se avisa antes de esperar la subida. Si no se
   puede medir (el HEVC de iPhone en algunos navegadores) **no se bloquea**: decide el servidor.
2. El servidor firma y `lib/cloudinary/subida-navegador.ts` sube **directo** a Cloudinary por XHR,
   con barra de progreso. Sin secretos en el cliente.
3. El servidor registra contra el archivo real (prompt M) y, si no cumple, lo borra.

**Toda llamada a una action maneja su error** (`try/catch` → mensaje, el panel queda usable). Es
lo contrario de lo medido el 23 de septiembre en 31 de 35 componentes. Los borrados piden
confirmación.

## C11 — sin componentes nuevos de estilo

El panel no define `Boton`, `Tarjeta` ni parecidos: usaría nombres que C11 cuenta como
duplicados. Usa **constantes de clase** (`TARJETA`, `BTN_PRIMARIO`…) y solo dos componentes
internos con nombre propio (`PosicionCarrusel`, `VideoCarreraTarjeta`). C11 sigue en 21/21.

## Prueba por HTTP, sin sesión

Build de producción (Turbopack) servido en local: las **6 acciones aparecen en el manifiesto** de
`/oceano` y **ningún tipo** se registra como action (C14). Llamadas por `POST /oceano` con
`Next-Action` y **cargas dañinas** (firmar una subida, registrar un `public_id` ajeno, borrar,
reordenar, cambiar el TikTok): las seis responden **200 con
`{ ok: false, error: "Solo dirección y el técnico pueden cambiar la portada." }`**. Ningún 500 y
ningún error en el registro del servidor.

**No probado con sesión:** entrar como directivo exige una contraseña, y eso no lo hace un agente.
La lógica que hay detrás del permiso ya se probó de punta a punta en M (31/31).

## Validación

`tsc` 0 · `lint` 0 · `test-orden` 14 reglas (C11 21/21, C13, C14) · 41/41 suites ·
`test-rediseno-oceano` **348/348** (pestaña Configuración en directivo y técnico, compartida, no
visible para maestro/alumno/tutor, apartado Noticias retirado, pieza `portada-medios` en los dos
roles) · `test-auditoria-permisos` 176/0 · `verificar-docs` · `build`. `MATRIZ-UX` §3 al día con
la pestaña nueva.
