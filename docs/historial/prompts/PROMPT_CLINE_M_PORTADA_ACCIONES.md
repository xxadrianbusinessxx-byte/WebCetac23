# PROMPT CLINE — M · Portada administrable (2/4): acciones del servidor

**Requisito:** el PROMPT L terminado y `supabase/crear-portada-medios.sql` **aplicado** por una
persona. Sin las tablas, nada de esto se puede probar. Comprueba antes de empezar:

```bash
node -e "…GET /rest/v1/portada_medios?limit=1 y /rest/v1/portada_ajustes?limit=1…"
```

Las dos deben dar **HTTP 200**. Si dan 404 (`PGRST205`), **para**: el SQL no está aplicado.

## OBJETIVO — qué debe ser cierto al terminar

`app/actions/portada.ts` expone las acciones para administrar la portada, todas con
`exigir("noticia.publicar")` —que ya tienen **directivo y técnico**, y nadie más—, validación
con `leerEntrada` y la lógica en `lib/`. Y la portada pública tiene una función de lectura.

## ANTES DE NADA

```bash
node scripts/gen-contexto.mjs --tarea=crear,permisos app/actions/ lib/escolar/portada/
```

## El flujo de subida, que es la razón de que haya dos acciones y no una

El archivo **no pasa por el servidor** (límite de 1 MB; ver el informe de L). Así que:

```
navegador ──(1) pide firma──────────────▶ actionFirmarSubidaPortada   → exigir + qué public_id
navegador ──(2) sube el archivo─────────▶ Cloudinary (directo, con la firma)
navegador ──(3) «ya está, este es»──────▶ actionRegistrarMedioPortada → exigir + VERIFICA + guarda
```

**El paso 3 no se fía del navegador.** Lo que el cliente dice que subió es una afirmación; lo
que hay en Cloudinary es un hecho. `actionRegistrarMedioPortada` consulta el recurso real
(`getCloudinary().api.resource(public_id, { resource_type })`) y pasa **sus** medidas, peso,
formato y duración por `validarImagen` / `validarVideo` del módulo puro. Si no cumple:
**borra el recurso de Cloudinary** y devuelve el error. Es §7 de la filosofía, literal: se
valida en el servidor. La validación del navegador (prompt N) es solo cortesía.

La API de administración de Cloudinary tiene límite (500/hora en el plan gratuito). Aquí se usa
**una vez por subida**, en una acción que solo ejecutan dos roles: está bien. Lo que **no** se
hace es usarla para leer la portada pública — para eso está la tabla.

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · El I/O en `lib/escolar/portada/portada.ts`

Funciones que reciben el cliente de Supabase (como el resto de `lib/escolar/`), sin decidir
nada que no esté ya en `portada-puro.ts`:

- `listarMedios(supabase)` — todas las filas, imágenes por `orden`, videos con su carrera.
- `leerPortadaPublica(supabase)` — lo que pinta la portada, en **una sola ida** (`Promise.all`):
  imágenes ordenadas con sus URLs de escritorio y móvil, las **carreras activas** de `carreras`
  con su rótulo público y su video si lo tienen, y los ajustes. Las URLs llevan la `version`.
- `guardarImagen`, `guardarVideo`, `eliminarMedio`, `reordenar` (vía la RPC `reordenar_portada`),
  `guardarAjustes`.
- `borrarRecursoCloudinary(public_id, resource_type)` en `lib/cloudinary/`, con
  `invalidate: true`.

**Reemplazar** una imagen o un video: se guarda la fila nueva y **después** se borra el recurso
viejo de Cloudinary. En ese orden: si falla el borrado, queda un archivo huérfano —se anota en
el log—; si fuera al revés y fallara el guardado, la portada perdería la imagen.

**Eliminar** una imagen deja un hueco en `orden`: se compacta con `ordenTrasEliminar` del puro.

### Parte 2 · `app/actions/portada.ts`

`"use server"`. **Solo `export async function`**: ni `export type { … }` ni reexportaciones.
C14 lo vigila, y es exactamente lo que tuvo caída producción del 17 al 23 de septiembre. Los
tipos que necesite la UI se importan de `lib/escolar/portada/` con `import type`.

| Acción | Entrada | Hace |
|---|---|---|
| `actionListarMediosPortada` | — | el estado completo para el panel |
| `actionFirmarSubidaPortada` | `{ tipo, variante, orden? , carreraId? }` | comprueba que el hueco es válido (orden 1–5; carrera existente y activa) y devuelve la firma con un `public_id` nuevo |
| `actionRegistrarMedioPortada` | `{ tipo, variante, public_id, orden?, carreraId?, textoAlt? }` | verifica en Cloudinary, guarda, borra el anterior |
| `actionEliminarMedioPortada` | `{ id, variante? }` | borra la fila (o solo la variante móvil) y el recurso |
| `actionReordenarPortada` | `{ ids: string[] }` | nuevo orden de las imágenes |
| `actionGuardarAjustesPortada` | `{ [clave]: valor }` | valida cada ajuste con el puro y guarda |

Cada una: `exigir("noticia.publicar")` **primero**; luego `leerEntrada(esquema, entrada)`;
luego delega. Respuesta `{ ok: true, … } | { ok: false, error }`, como el resto.
`subido_por` / `actualizado_por` salen de `sesion.profesorId`, **nunca** de la entrada.

**No crees una capacidad nueva.** `noticia.publicar` es exactamente «quién publica en la
portada», y la tienen los dos roles correctos. Una capacidad nueva obligaría a tocar la matriz
para decir lo mismo.

### Parte 3 · Inventario y permisos

```bash
npm run gen:matriz          # las acciones nuevas entran en MATRIZ-PERMISOS §5
npm run test:permisos       # toda action llama a exigir(); ninguna lee el rol
```

`test-auditoria-permisos` debe contar las acciones nuevas y seguir en 0 fallos.

**Y la prueba que de verdad importa**, porque tsc y el build no la ven (lección del 23 de
septiembre): compila **como Vercel** y comprueba que ningún tipo acabó registrado como acción.

```bash
npm run build
grep -rhoE 'registerServerReference\)\([A-Z][A-Za-z]+,' .next/server   # debe salir VACÍO
```

---

## REGLAS

- Ninguna acción recibe el archivo. Si ves un `File` o un `FormData` en `portada.ts`, el diseño
  se rompió: el archivo va directo a Cloudinary.
- La verificación de la Parte 1 del flujo (consultar el recurso real) **no es opcional**.
- Nada de `revalidatePath`: la portada se genera en cada petición, como hoy. Si se quiere
  cachear, es su propio cambio.

## LÍMITES — qué NO se toca

- `app/components/**` y `app/page.tsx` (prompts N y O) · `lib/cloudinary/noticias.ts` ·
  `lib/auth/**` · la matriz a mano (solo `gen:matriz`) · `docs/historial/**`

## VALIDACIÓN

```bash
node scripts/test-portada.mjs
npm run test:permisos
node scripts/test-orden.mjs            # C12 (entrada validada) y C14 (exports) incluidas
npm run test:ci
npx tsc --noEmit
npm run lint
npm run build && grep -rhoE 'registerServerReference\)\([A-Z][A-Za-z]+,' .next/server
```

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-M-PORTADA-ACCIONES.md`: las seis acciones con su
entrada y sus errores posibles, qué verifica el registro contra Cloudinary, la salida de
`test:permisos`, y el `grep` de `registerServerReference` vacío.

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
