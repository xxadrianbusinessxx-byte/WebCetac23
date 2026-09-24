# PROMPT CLINE — L · Portada administrable (1/4): datos, reglas y firma

## La campaña, en dos líneas

La pantalla de bienvenida pasa a tener un **carrusel de hasta 5 imágenes**, **un video por
carrera** y **enlaces de contacto** que directivo y técnico administran desde una pestaña
nueva, «Configuración → Video e imágenes». Son cuatro prompts: **L** datos y reglas (este),
**M** acciones del servidor, **N** panel de administración, **O** portada pública.

## OBJETIVO — qué debe ser cierto al terminar este prompt

1. `supabase/crear-portada-medios.sql` existe, es aditivo e idempotente, y lo puede aplicar
   una persona en el SQL Editor.
2. `lib/escolar/portada/portada-puro.ts` concentra **todas** las reglas —límites, proporciones,
   formatos, rótulos, ajustes— sin una línea de I/O, con su suite.
3. `lib/cloudinary/firma.ts` firma una subida directa del navegador a Cloudinary sin que el
   secreto salga nunca del servidor.

**Este prompt no toca `app/` ni añade acciones.** Es la base sobre la que se apoyan M, N y O.

## ANTES DE NADA

```bash
node scripts/gen-contexto.mjs --tarea=crear lib/escolar/ lib/cloudinary/ supabase/
```

Y lee `docs/normativo/INVARIANTES.md` §4, §5, §9 y §10.

## MEDICIÓN INICIAL (pegada — no re-investigar)

**Por qué la subida no puede pasar por una Server Action.** Next limita el cuerpo de una
Server Action a **1 MB** (`next.config.ts` no lo cambia) y Vercel corta en **4,5 MB**. Hoy las
imágenes van navegador → acción → Cloudinary porque `lib/imagen/comprimir.ts` las reduce a
0,8 MB y **1280 px**: borroso en un hero a pantalla completa, e imposible para un video.
Por eso el archivo irá **directo del navegador a Cloudinary con una firma** emitida por el
servidor.

**Lo que ya existe y este trabajo sustituye.** `lib/cloudinary/noticias.ts` sube «noticias de
inicio» a 2 slots fijos (`noticia_inicio_1`, `_2`) y comprueba si existen con la API de
administración de Cloudinary. **Ningún componente lo usa**: es un backend dormido, y su
apartado «Noticias» del técnico está apagado a propósito. No se reutiliza su mecanismo porque:
comprobar existencia por la API de administración en una página **pública** choca con su
límite (500/hora en el plan gratuito); los slots no guardan orden ni carrera; y sobrescribir
un `public_id` deja al CDN sirviendo la versión vieja. **No lo borres** (R8): en el prompt N se
marca `@deprecated` cuando su sustituto ya tenga pantalla.

**El catálogo de carreras** (medido, lectura):

```
carreras · 2 filas activas
  c250801e-…  clave MECATRONICA  nombre MECATRONICA
  3e08314f-…  clave RH           nombre RH
```

El catálogo dice «RH». La portada debe decir **«RECURSOS HUMANOS»** y **«MECATRÓNICA»**. Los
rótulos van en el módulo puro, por `clave`, **sin tocar `carreras`**: `nombre` se usa en otros
sitios y renombrarlo aquí es una migración ajena a este trabajo. `etiquetaCarrera()` de
`facetas-materia.ts` **no sirve**: devuelve rótulos CORTOS («MC», «RH») para filtros.

**Proporciones del diseño** (`things/figma-oceano/Pantalla de bienvenida.png`, 2880 × 4060):

```
hero               2880 × 1231  → 2,34 : 1  ≈ 7:3
caja de video      2032 ×  775  → 2,62 : 1  (se decide 16:9: ver abajo)
«Conoce nuestra oferta educativa»  al 81 % de la altura del hero
```

## Decisiones ya tomadas (no se reabren)

| # | Decisión |
|---|---|
| 1 | Cada imagen de carrusel admite una **variante vertical opcional para teléfono**. Sin ella, se usa la horizontal |
| 2 | Los videos se muestran en **16:9**, no recortados a la caja del diseño |
| 3 | «Alumnos estrella» y «Cree en ti» **salen** de la portada (prompt O) |
| 4 | Rótulos públicos por clave: `MECATRONICA → MECATRÓNICA`, `RH → RECURSOS HUMANOS` |
| 5 | Redes sociales, teléfono, correo y dirección se **configuran desde la pestaña Configuración** |

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · El SQL

`supabase/crear-portada-medios.sql`, con la cabecera y el estilo de
`supabase/crear-tablas-uis-pendientes.sql` (léelo: aditivo, idempotente, RLS permisiva como el
resto, profesor por `PROFESORES.ID` **sin FK** y por qué).

**Tabla `portada_medios`** — una fila por imagen de carrusel o por video de carrera:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` pk | `gen_random_uuid()` |
| `tipo` | `text not null` | `check (tipo in ('imagen','video'))` |
| `orden` | `smallint` | `check (orden between 1 and 5)`. **Solo imagen** |
| `carrera_id` | `uuid` | `references carreras(id) on delete cascade`. **Solo video** |
| `public_id` | `text not null` | el archivo principal (horizontal o video) |
| `version` | `bigint not null` | la que devuelve Cloudinary: va en la URL y **rompe la caché del CDN** al reemplazar |
| `public_id_movil`, `version_movil` | | variante vertical. **Solo imagen**, opcional |
| `texto_alt` | `text` | la imagen **lleva texto** (Visión, Valores): sin esto un lector de pantalla no lo ve |
| `ancho`, `alto`, `bytes` | `int`, `int`, `bigint` | medidos por el servidor, no declarados por el cliente |
| `duracion_s` | `numeric` | solo video |
| `subido_por` | `integer` | `PROFESORES.ID`, sin FK |
| `created_at`, `updated_at` | `timestamptz` | |

Restricciones, **y el porqué de cada una va en el SQL como comentario**:

- Un `check` de forma: imagen ⇒ `orden` no nulo y `carrera_id` nulo; video ⇒ `carrera_id` no
  nulo, `orden` nulo y sin variante móvil.
- `unique (orden) deferrable initially immediate`. **Deferrable, y no un índice parcial**: al
  reordenar hay que intercambiar posiciones, y un índice único normal se comprueba fila a fila
  y falla a mitad del intercambio. Los videos tienen `orden` nulo y los nulos no chocan, así
  que una restricción normal basta y no hace falta índice parcial.
- `unique (carrera_id)`: **un video por carrera**, garantizado por la base.
- Con `orden between 1 and 5` y único, **el máximo de 5 imágenes lo garantiza la base**.

**RPC `reordenar_portada(p_ids uuid[])`**: `set constraints … deferred` y un único `update` con
`unnest(p_ids) with ordinality`. Rechaza con excepción si `p_ids` no son exactamente las
imágenes existentes.

**Tabla `portada_ajustes`** — clave/valor para lo configurable del pie y la barra:

| Columna | Tipo |
|---|---|
| `clave` | `text` pk, `check (clave in (…))` con las claves de abajo |
| `valor` | `text not null` |
| `actualizado_por`, `updated_at` | |

Claves: `tiktok_url`, `facebook_url`, `whatsapp_numero`, `correo`, `telefono`, `direccion`.
Siembra `direccion` con el literal actual de `app/page.tsx` (`on conflict do nothing`).

**PARA AQUÍ.** Enseña el SQL. **No lo ejecutes**: lo aplica una persona.

### Parte 2 · `lib/escolar/portada/portada-puro.ts` y su suite

Cero I/O, cero imports de Supabase o de `node:`: es un `-puro` y C5 lo vigila. Importa con
extensión explícita (C13). Contiene, como constantes con nombre y comentario de su origen:

```
MAX_IMAGENES           5
PROPORCION.escritorio  7/3     ideal 2800×1200 · mínimo 1400×600
PROPORCION.movil       4/5     ideal 1080×1350 · mínimo  810×1013
PROPORCION.video       16/9    hasta 1920×1080
TOLERANCIA_PROPORCION  0.03
MAX_BYTES_IMAGEN       10 MB   (tope del plan gratuito de Cloudinary para imagen)
MAX_BYTES_VIDEO        100 MB  (ídem para video; la UI recomienda ≤ 50 MB)
MAX_DURACION_VIDEO_S   120
FORMATOS_IMAGEN        jpg · jpeg · png · webp
FORMATOS_VIDEO         mp4 · mov · webm      ← mov: es lo que graba un iPhone
ZONA_SEGURA            25 % inferior (el rótulo de la oferta) · 5 % a cada lado (flechas)
ROTULOS_CARRERA        { MECATRONICA: "MECATRÓNICA", RH: "RECURSOS HUMANOS" }
AJUSTES_PORTADA        las 6 claves, con tipo y etiqueta para el formulario
```

Y funciones puras:

- `validarImagen({ ancho, alto, bytes, formato, variante })` y
  `validarVideo({ ancho, alto, bytes, formato, duracion_s })` → `{ ok: true }` o
  `{ ok: false, error }` con **mensajes en castellano pensados para quien sube**: «La imagen mide
  1920 × 1080 (16:9) y la portada necesita 7:3. Recórtala a 2800 × 1200.» No «ratio inválido».
- `rotuloCarrera(clave, nombre)` — rótulo público, con `nombre` de respaldo.
- `siguienteOrdenLibre(ordenes)`, `ordenTrasEliminar(ordenes, eliminado)` — que no queden huecos.
- `validarAjuste(clave, valor)` — URLs `https://` y del dominio que toca (tiktok.com,
  facebook.com); WhatsApp solo dígitos, 10 a 13; correo con forma de correo.
- `enlaceWhatsApp(numero)` → `https://wa.me/<dígitos>`.
- `publicIdNuevo(tipo, variante, sufijo)` → `cetac23/portada/<tipo>_<variante>_<sufijo>`. El
  sufijo único lo **recibe** (el `-puro` no genera aleatorios): reemplazar crea un id nuevo y el
  viejo se borra, así ningún CDN sirve la versión anterior.

Estas reglas las usarán **el navegador (N) y el servidor (M)**. Es la razón de que vivan aquí:
dos copias de «qué tamaño es válido» divergen el primer día (R6).

**Suite `scripts/test-portada.mjs`**: importa el `.ts` directamente (sin compilar, como las
otras 40). Cubre, como mínimo: los bordes de la tolerancia (2,26 y 2,41 pasan; 2,20 no), una
foto 16:9 rechazada con el mensaje que dice qué hacer, `mov` aceptado, 121 s rechazado, las
dos carreras reales con su rótulo y una clave desconocida cayendo a `nombre`, los seis ajustes
con un valor bueno y uno malo cada uno, y que reordenar/eliminar no deja huecos.

**PARA AQUÍ.** `node scripts/test-portada.mjs` y `node scripts/test-orden.mjs`.

### Parte 3 · `lib/cloudinary/firma.ts`

`import "server-only"`. Una función que, dados `public_id` y `resource_type` (`image` o
`video`), devuelve `{ cloudName, apiKey, timestamp, signature, public_id, resourceType }`
usando `cloudinary.utils.api_sign_request` con `CLOUDINARY_API_SECRET`. El secreto **no** va en
lo devuelto. Usa `cloudinaryConfigurado()` y `getCloudinary()` de `./config.ts`, que ya existen.

Y en `lib/cloudinary/urls.ts`, **de forma aditiva**: que la función de URL acepte `version` y
`resourceType` (`image`/`video`) opcionales, sin cambiar lo que devuelve para los llamadores
actuales.

Añade también `leerEntrada(esquema, objeto)` en `lib/validacion/`, hermana de `leerFormData`
y con **su misma** forma de respuesta y de mensajes. Las acciones de M reciben objetos, no
`FormData` (el archivo no pasa por ellas), y sin este helper cada una validaría a su manera.

---

## REGLAS

- **Nada de I/O en el `-puro`.** Ni `process.env`, ni `Date.now()`, ni aleatorios: se reciben.
- Los mensajes de validación se escriben para una persona de dirección, no para un técnico.
- Cero dependencias nuevas: `cloudinary` y `valibot` ya están.
- Ninguna migración aplicada: el SQL se entrega, no se corre.

## LÍMITES — qué NO se toca

- `app/**` entero · `carreras` y cualquier tabla existente · `lib/cloudinary/noticias.ts`
  (solo se marca en N) · `lib/imagen/comprimir.ts` · `docs/historial/**`

## VALIDACIÓN

```bash
node scripts/test-portada.mjs
node scripts/test-orden.mjs
npm run test:suites
npx tsc --noEmit
npm run lint
node scripts/verificar-docs.mjs
```

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-L-PORTADA-DATOS.md`: el SQL con el porqué de cada
restricción, las constantes y su origen, la salida de la suite, y cualquier regla que te haya
parecido mal fijada — con el número que propondrías y por qué.

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
