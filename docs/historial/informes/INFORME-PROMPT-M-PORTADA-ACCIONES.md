# INFORME — PROMPT M · Portada administrable (2/4): acciones del servidor

**Fecha:** 2026-09-23 · **Rama:** `feature/portada-administrable` · **Ejecutado por:** Claude

## Las seis acciones — `app/actions/portada.ts`

Todas: `exigir("noticia.publicar")` → `leerEntrada(esquema)` → delegan en `lib/`. Solo
`export async function` (C14). `subido_por` sale de `sesion.profesorId`, nunca de la entrada.

| Acción | Entrada | Errores posibles |
|---|---|---|
| `actionListarMediosPortada` | — | sin permiso · no se pudo leer |
| `actionFirmarSubidaPortada` | `{ tipo, variante?, orden?, carreraId? }` | destino mal formado · hueco en el carrusel · móvil sin escritorio · carrera inexistente o inactiva |
| `actionRegistrarMedioPortada` | `{ …destino, public_id, textoAlt? }` | no corresponde a ese destino · archivo no encontrado · **no cumple las medidas (se borra)** · otra persona subió al mismo sitio |
| `actionEliminarMedioPortada` | `{ id, variante?: "movil" }` | ya no existe · sin versión móvil |
| `actionReordenarPortada` | `{ ids }` | la lista no coincide con el carrusel actual |
| `actionGuardarAjustesPortada` | `{ ajustes: { clave: valor } }` | clave inexistente · formato (con la etiqueta del campo: «Facebook: …») |

**No se creó capacidad nueva**: `noticia.publicar` ya la tienen directivo y técnico, y nadie más.

## Qué verifica el registro contra Cloudinary

El navegador sube directo a Cloudinary (una action no admite más de 1 MB). Al registrar, el servidor
**no se fía** de lo que dice el navegador: comprueba que el `public_id` sea de la portada y del tipo
declarado, lee el recurso REAL con la API de administración y pasa sus medidas por las reglas del
puro. Si no cumple, **lo borra de Cloudinary**. Y vuelve a comprobar el destino, porque entre firmar
y registrar pueden pasar minutos.

## Tres cosas que el prompt no preveía

**1 · Las tablas nuevas se habrían colado como MATERIAS.** `listarTablasMateriasDesdeSupabase`
devuelve toda tabla que no esté en `TABLAS_SISTEMA`, y la usan 8 acciones de `materias.ts`. Se
añadieron `portada_medios` y `portada_ajustes` a la exclusión. Y al medirlo contra el esquema real
(426 tablas) aparecieron **otras diez que ya se colaban**, siete de las UIs pendientes del 17 de
septiembre: `buzon_mensajes`, `alumno_etiquetas`, `actividades`, `reportes_alumno`,
`solicitudes_constancia`, `citas`, `mensajes_internos`, `ciclo_transiciones`, `actividad_entregas`,
`asistencia_traspasos_historico`. **No se tocaron** —no son de este trabajo— y quedan en
`pendientes.json` como `tablas-sistema-como-materia`, con el arreglo inmediato y el de fondo.

**2 · Dos reglas nuevas en el puro, con prueba:** `ordenPermitidoParaSubir` (se reemplaza una
posición ocupada o se usa la siguiente libre, nunca un hueco) y `publicIdCorrespondeA` (un video no
se registra como imagen). Y `validarDestino`, porque las reglas **entre campos** no pueden ir en el
esquema: `leerEntrada` valida campo a campo y una comprobación de objeto se saltaría sin avisar.

**3 · Un fallo mío, cazado por la prueba de punta a punta.** `leerRecurso` pedía
`media_metadata: false`, y la API de administración **omite la duración del video sin
`media_metadata: true`** (medido: `undefined` frente a 13,4134 s). Todo video se habría rechazado por
«no se pudo leer la duración». Ahora se piden los metadatos solo para video.

## Inventario y permisos

- `npm run gen:matriz`: las 6 entran en `MATRIZ-PERMISOS.md` §5 bajo `portada.ts`; `--check` en 0.
- `test-permisos`: **573/0**, idéntico (no cambió ningún permiso).
- `test-auditoria-permisos`: **176 acciones auditadas** (antes 170), 276 pasadas, 0 fallidas.
- Build con Turbopack: **ningún tipo registrado como Server Action**. Las 6 acciones todavía no
  están en el manifiesto porque ninguna página las importa: llegan con el panel (prompt N).

## La prueba de punta a punta

Como las acciones aún no se pueden llamar por HTTP, se probó el **código real** de
`lib/escolar/portada/portada.ts` desde Node (un *loader* de pruebas resuelve `@/` y `server-only`),
contra Supabase y Cloudinary de verdad y con la **clave anónima** —la de la app—, para probar también
que RLS y permisos dejan escribir. **31/31**:

subida de escritorio y su URL con versión sirviendo 200 · rechazo de hueco y de móvil sin base ·
variante móvil · segunda imagen, reordenar, reemplazar **con borrado del archivo anterior en
Cloudinary** · **una 16:9 subida como portada se rechaza al registrar y se borra** · un video no se
registra como imagen · video 16:9 en su carrera con rótulo público y póster sirviendo 200 · ajustes
con los enlaces de WhatsApp y TikTok construidos · un enlace sin https rechazado · un valor vacío
quita el ajuste · quitar solo la móvil · eliminar compacta el orden.

**Limpieza verificada al terminar:** 0 filas en `portada_medios`, **0 de 6 archivos de prueba vivos
en Cloudinary**, ajustes como estaban (solo `direccion`).

## Validación

`test-portada` 94/94 · `test-validacion` 70/70 · `test:permisos` · `test-orden` 14 reglas ·
`gen:matriz --check` · `test:ci` · `tsc` · `lint` · `build` sin tipos registrados · punta a punta
31/31.
