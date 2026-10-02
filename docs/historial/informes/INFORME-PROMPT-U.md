# INFORME — PROMPT U: videos de carrera por enlace · «Alumnos / Tutores» del directivo

Ejecutado por Claude el 2026-10-01, a petición del responsable («ejecútalo tú y
reaudita en los pasos»), sobre `f45986d`. Dos commits: Parte A `0276097`, Parte B
el siguiente. El prompt, con su retroalimentación, está en
`docs/historial/prompts/PROMPT_U_PORTADA_ENLACES_Y_ALUMNOS_TUTORES.md`.

## Parte A — el video de cada carrera es un enlace, con su texto al lado

### Implementado
- La portada pública pinta el video de cada carrera con el reproductor de YouTube
  (`youtube-nocookie`) o de TikTok (Embed Player `player/v1`). La banda toma la
  forma del video: 16:9 o 9:16. Al lado va el texto de la carrera, que alterna de
  lado en pantalla ancha.
- «Configuración → Video e imágenes › Oferta educativa» (directivo y técnico):
  enlace con detección en vivo, formato corregible, vista previa, texto de hasta
  600 caracteres con contador, «Guardar» y «Quitar video».
- Antes de guardar, el servidor pregunta a la plataforma (oEmbed) si el video
  existe y se puede insertar.

### Archivos principales
`lib/escolar/portada/portada-puro.ts` (reglas) · `lib/oembed/oembed.ts` (I/O
externo, nuevo) · `lib/escolar/portada/portada.ts` (lectura y guardado) ·
`lib/validacion/esquemas-puro.ts` · `app/actions/portada.ts` ·
`app/components/ui/video-incrustado.tsx` (nuevo) · `app/page.tsx` ·
`app/components/portada-medios-panel.tsx` · `supabase/crear-portada-carreras.sql`
(nuevo) · `scripts/diag-portada.mjs` (nuevo) · `scripts/test-portada.mjs`.

### Arquitectura
- Tabla nueva `portada_carreras` (una fila por carrera). Guarda la URL CANÓNICA y
  el formato; plataforma e id se derivan al leer (una sola fuente).
- El `src` del iframe sale siempre de `urlInsercionVideo` con un id validado por
  regex: lo que pega la persona nunca llega a un `<iframe>`.
- El video SUBIDO a Cloudinary queda desactivado en el servidor
  (`validarDestino` rechaza `video`) y en la lectura; sus piezas, `@deprecated`.

### Seguridad
- `exigir("noticia.publicar")`, sin capacidades nuevas.
- Host comparado EXACTO; la suite prueba subdominio falso, `usuario@host`,
  `javascript:`, `data:` y `ftp:`.
- El servidor solo llama a los dos endpoints oEmbed fijos y a enlaces cortos de
  TikTok ya aceptados por el puro (sin SSRF), con 5 s de tiempo límite.

### Rendimiento
iframes `loading="lazy"`; la comprobación oEmbed solo al guardar, nunca al pintar.

### Validación
- Medición (`diag-portada.mjs`), antes = después: 2 imágenes (1 y 2), 0 videos
  subidos, `portada_carreras` sin crear.
- `test-portada` 94 → **161**. Mutación comprobada: comparar el host con
  `endsWith` hace caer el caso del subdominio falso.
- oEmbed real: 200 para un video y un Short existentes; **400** (no 404) para un
  id inexistente, en YouTube y en TikTok.
- Navegador (`npm start`, sin sesión): `/` sin el SQL se ve igual que antes
  —carrusel y las dos carreras, 0 errores de consola ni de servidor—, prueba de
  que `PGRST205` no rompe la portada. Los dos reproductores cargan con los `src`
  del puro (YouTube sin «Error 153»; TikTok en 9:16).
- `npm run test:ci` en verde (el único aviso de lint es previo:
  `scripts/gen-panel.mjs`).

### Legacy
Quedan `@deprecated`, sin consumidores: `validarVideo` y sus constantes,
`medirVideo` y las ramas de video de `comprobarDestino`/`registrarMedio`.
Pendiente `retirar-video-cloudinary-portada`. El CHECK de `portada_medios`
sigue admitiendo `'video'`: no estorba.

### Pendiente
`sql-portada-carreras`: una persona ejecuta el `.sql` y prueba con sesión de
directivo o técnico (un video de YouTube, un Short y un TikTok).

## Parte B — «Alumnos / Tutores» del directivo

### Implementado
En Administración escolar › Alumnos / Tutores, el directivo busca a cualquier
alumno por nombre o CURP (el buscador de Administración escolar) y ve cuatro
modos: Información personal (con el tutor principal), Seguimiento médico (con su
historial), Reportes y Citas. Ninguno lleva a asistencias ni calificaciones.

### Archivos principales
`lib/auth/permisos.ts` · `lib/navegacion/mapa-navegacion.ts`
(`llevaBuscadorAlumno`) · `lib/navegacion/contenido-directivo.ts`
(`vistaAlumnosTutores`) · `app/actions/administracion.ts`
(`actionListarCitasDeAlumno`) · `app/components/administracion-panel.tsx`
(`TarjetaCita`, `CitasDeAlumno`) · `app/oceano/page.tsx` ·
`app/components/oceano/shell-oceano.tsx` · `contenido-directivo-oceano.tsx` ·
`buscador-expediente-oceano.tsx` (`AvisoBuscarAlumno`, movida aquí) ·
`contenido-administracion-oceano.tsx`.

### Arquitectura
- Cero pantallas nuevas: las piezas del alumno y los paneles de Administración
  escolar, acotados al alumno elegido.
- `page.tsx` decide quién abre expediente con `puede(rol, "alumno.ver_expediente")`,
  no con el rol; el expediente del directivo viaja en `datosDirectivo.alumno`.
- La tarjeta de cita se extrajo (`TarjetaCita`) para que la lista del ciclo y la
  de un alumno no dibujen dos veces la misma máquina de estados.

### Seguridad
- Única capacidad que cambia: `alumno.ver_expediente` al directivo (abre el
  buscador). SOBRE QUIÉN ya lo decidía `resolverAccesoAlumno` (a todos).
- `actionListarCitasDeAlumno`: `cita.gestionar` + `resolverAccesoAlumno`.
- Efecto consciente: el directivo edita información personal y seguimiento
  médico desde aquí (ya tenía `alumno.editar_datos_personales`). El historial lo
  firma como «Dirección».

### Validación
- Medición antes = después: historial médico 2 ediciones (`administracion`),
  citas 4 (todas rechazadas). Esta parte no escribe datos.
- `test-rediseno-oceano` 469 → **507**; `test-permisos` 737 → **738**. Mutación
  comprobada: si «Seguimiento médico» montara el registro de calificaciones, caen
  dos casos.
- `npm run test:ci` en verde (51/51 suites, 201 actions auditadas, build).
- **No verificado en navegador**: exige la sesión real de un directivo, y la base
  es producción.

### Observado y no cambiado
Con `?alumno=` de una CURP que no existe, `actionObtenerPerfilAlumno` devuelve
acceso sin alumno y el expediente se abre vacío. Ya pasaba en Administración
escolar; con el buscador no se llega ahí. No se tocó.

### Pendiente
Probar con la sesión del directivo los cuatro modos, incluido guardar un cambio
médico (debe aparecer «Dirección» en el historial y en
`node scripts/diag-seguimiento-medico.mjs`).
