# INFORME — PROMPT J · Tipos desde la base: el instrumento queda puesto, el archivo no

> Ejecutado el 2026-09-20 sobre `feature/uis-pendientes` (HEAD `c0705ff`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_J_TIPOS_DESDE_LA_BASE.md`.
>
> **El objetivo no se cumplió, y esta vez no por el código: por la máquina.**
> `lib/supabase/database.types.ts` **no existe**, porque `supabase gen types --db-url` —el
> camino que el prompt daba por bueno cuando `--project-id` pidiera sesión— **exige Docker**: la
> CLI arranca la imagen `postgres-meta` para leer el esquema. Aquí no hay demonio de Docker.
> Las Partes 2 y 3 no se pueden empezar sin el archivo.
>
> Lo que sí queda hecho: el generador (`scripts/gen-tipos-db.mjs`, con su contrato `--check`, su
> versión de CLI clavada y su fila `LEE(red)` en el README), la decisión escrita en
> `pendientes.json`, y **la medición del esquema real y de sus tres deudas**, que el prompt
> señalaba como su hallazgo más valioso. Eso último sí se pudo medir, por el camino que el repo
> ya usa para leer el esquema.

---

## 1 · Por qué no se generó el archivo

### Lo que se probó

```
$ node scripts/gen-tipos-db.mjs
Connecting to db.nnhjqqjonabchluuwmkp.supabase.co 5432
failed to inspect docker image: error during connect: Get "http://%2F%2F.%2Fpipe%2F
dockerDesktopLinuxEngine/v1.51/images/public.ecr.aws/supabase/postgres-meta:v0.91.5/json":
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
Docker Desktop is a prerequisite for local development. Follow the official docs to install:
https://docs.docker.com/desktop
```

Y no es cosa de la versión. Probadas las tres, todas por el mismo motivo:

| CLI | Resultado |
|---|---|
| `supabase@2.117.0` | FALLA · `postgres-meta:v0.91.5` · Docker no disponible |
| `supabase@2.39.2` | FALLA · `postgres-meta:v0.91.5` · Docker no disponible |
| `supabase@1.207.9` | FALLA · `postgres-meta:v0.84.2` · Docker no disponible |
| `--project-id` / `--linked` | No probado: exigen `supabase login` (access token) y en `.env.local` **no hay** token, solo `DATABASE_URL` y las claves del proyecto |

El prompt preveía la autenticación (`--project-id` pide login) y ofrecía `--db-url` como
alternativa «sin sesión de la CLI». Es cierto que no pide sesión — pide **Docker**, que en un
portátil de desarrollo se da por hecho y aquí no está. **La premisa de la Parte 1 se rompe por el
entorno, no por el esquema.** Sin Docker o sin token, `database.types.ts` no se puede escribir
hoy; con cualquiera de los dos, `node scripts/gen-tipos-db.mjs` lo escribe en un comando.

Queda anotado en `docs/sistema/pendientes.json` como `tipos-db-sin-generar`, con lo que hay que
decidir (instalar Docker Desktop **o** emitir un token y `SUPABASE_ACCESS_TOKEN`) y con lo que hay
que comprobar después —`npx tsc --noEmit` y el tamaño del archivo, porque C9 no deja pasar de
1 000 líneas y un `database.types.ts` real lo supera—. Es una decisión de una persona, que es
exactamente lo que el prompt pide hacer cuando algo así no se puede automatizar.

### Por qué NO se generó por otro camino

Existe un camino que **sí** funciona desde esta máquina: el OpenAPI de PostgREST
(`GET /rest/v1/`, HTTP 200), que es el que ya usan `gen-tablas-desde-supabase.mjs` y
`lib/escolar/openapi.ts`. Se descartó **a propósito**, y la razón importa:

- Es una fuente **derivada y con pérdida**. No distingue `uuid` de `text` ni `date` de
  `timestamp`; aproxima la nulabilidad; no trae las claves foráneas ni los enums del catálogo.
- Un `database.types.ts` construido desde ahí no sería «el esquema real tipado»: sería una
  **maqueta** que parece autoritativa. Y lo que produce la Parte 2 —la lista de errores de
  `tsc`— sería **en parte ficticio**, justo el artefacto que el prompt venía a medir.
- El CONTRATO §4 prohíbe crear un camino paralelo a una fuente única. Escribir un segundo
  generador de tipos al lado del canónico es eso, y además fabricaría un archivo que el día que
  la CLI funcione habría que tirar entero.

Se prefiere un instrumento que funciona y un archivo que falta, a un archivo que miente.

---

## 2 · El esquema real (medido, por el camino que sí llega)

Lectura de `/rest/v1/` con la clave de servicio: **HTTP 200**, `definitions` con 424 relaciones.

| | |
|---|---|
| Relaciones en `public` | **424** |
| Tablas por materia (`1RO…`/`2DO…`/`3RO…`/`4TO…`/`5TO…`/`6TO…` con sufijo `MAT###`) | **384** |
| Tablas «… REGISTRO DE CALIFICACIONES FINALES» (una por grupo) | **24** |
| Resto: las tablas de sistema que el código nombra | **16** |
| Nombres con espacios | 28 |

**384 + 24 = 408 de 424 —el 96 % del esquema— son tablas por materia o por grupo.** El resto del
sistema vive en 16 tablas. Eso solo ya mide la deuda #3 del prompt: no es «una tabla física por
materia», son 384.

### Las tres deudas, medidas por primera vez

**1 · `calendario_escolar`: el texto y el uuid conviven.**

```
id:uuid · ciclo_escolar:text · fecha:date · tipo:text · descripcion:text ·
creado_por:text · created_at:timestamptz · periodo_id:uuid
```

Las 8 columnas, con los dos caminos a la vez: `ciclo_escolar` (texto, legacy) y `periodo_id`
(uuid, canónico). Es la causa raíz de los fallos históricos de calendario y asistencia, y ahora
está escrita: **la misma tabla tiene la clave vieja y la nueva, y nada prohíbe escribir en
cualquiera de las dos.**

**2 · Identidad de profesor: `profesor_clave` y `profesor_id` en las tres tablas.**

```
asistencia_alumnos    (15 col) … profesor_clave:text · profesor_id:integer · periodo_id:uuid ·
                                periodo_evaluacion_id:uuid · grupo_materia_id:uuid
clases_impartidas     (13 col) … profesor_clave:text · profesor_id:integer · idem
asignaciones_profesor  (9 col) … profesor_clave:text · profesor_id:integer · desde · hasta
```

Treinta veces leído y ahora medido: `profesor_id` es **integer** (la clave de `PROFESORES`, que
es una tabla con nombre en mayúsculas), no un uuid. La deuda #2 no es solo «hay dos columnas»:
son **de dos tipos distintos**, y por eso un `createClient<Database>` sí la vería.

**3 · Las tablas por materia y `grupo_materias.tabla_legacy`.**

```
grupo_materias  (7 col) id:uuid · grupo_id:uuid · materia_id:uuid · tabla_legacy:text · activo
```

El puntero al nombre físico de la tabla por materia es `tabla_legacy: text`. Es la deuda que el
propio prompt reconoce que **no cierra un generador**: 384 tablas cuyos nombres y columnas se
crean por RPC (`escolar_agregar_columnas`, `escolar_sync_columns`) no pueden estar en un tipo
estático y tendrán que quedarse tras el tipo laxo que ya exista.

### Discrepancias entre lo que el código cree y lo que hay

Cruce de las 43 constantes de nombre de tabla/bucket del código contra las 424 relaciones:

- **Las 29 constantes `TABLA_*` de `lib/escolar/tables.ts` existen todas**, con su nombre exacto,
  incluido lo incómodo: `"ETIQUETAS (STATUS)"`, `"COMENTARIOS PROFESORES"`, `"PERMISOS CARPETAS"`
  (con espacios y mayúsculas). Es una buena noticia para la Parte 2: como están declaradas
  `export const TABLA_X = "ALUMNOS"`, TypeScript **infiere el literal**, así que un cliente
  genérico las comprobaría una a una en vez de aceptarlas como `string`.
- **Tres de las cuatro que no aparecen son buckets de Storage**, no tablas
  (`CALIFICACIONES_BUCKET`, `BUCKET_JUSTIFICACIONES`, `BUCKET_DOCUMENTOS`): viven en Storage y
  PostgREST no los expone. Falsa alarma, y anotada para no volver a levantarla.
- **Una es real: `CALIFICACIONES_TABLE = "archivos_calificaciones"`.**

```
GET /rest/v1/archivos_calificaciones?select=*&limit=1
HTTP 404  {"code":"PGRST205","hint":"Perhaps you meant the table 'public.1RO A REGISTRO …'"}
```

  Comprobado también contra los 47 `.sql` del repo: `archivos_calificaciones` **solo aparece en un
  comentario** de `supabase/crear-tablas-asistencias.sql` (líneas 13 y 15); ningún archivo la crea.
  O está en un esquema que PostgREST no expone, o el código la usa sin que exista. La primera se
  descarta en un minuto desde el SQL Editor; lo que este informe puede afirmar es lo medido: **el
  nombre que el código usa para guardar archivos de calificaciones no está en `public`.**
- **381 de los 384 `.from(…)` del repo pasan una constante o una variable, no un literal**
  (`lib/calificaciones/storage.ts` → `.from(CALIFICACIONES_TABLE)`, y 369 más). Solo 3 pasan una
  cadena literal, y las 3 existen. Dato para la Parte 2: la mayoría de los errores de tipo que
  saldrían **no** vendrían de nombres mal escritos, sino de constantes tipadas como `string` que un
  cliente genérico no puede aceptar, y de tablas por materia cuyos nombres no son estáticos.
- Las 6 RPC que el código llama (`activar_ciclo_operativo`, `eliminar_ciclo`,
  `escolar_agregar_columnas`, `escolar_sync_columns`, `traspasar_materia_a_profesor`,
  `obtener_perfil_alumno`) **no se pudieron verificar aquí**: el OpenAPI las declara en `paths`, no
  en `definitions`, y la sonda solo miró `definitions`. Queda como límite declarado, no como
  hallazgo.

---

## 3 · Las Partes 2 y 3 no se empezaron, y por qué no se fingieron

La Parte 2 pide `createClient<Database>(url, key)` en `lib/supabase/` —tres archivos, 64 líneas— y
después medir `npx tsc --noEmit`. Sin `Database` no hay genérico que enchufar: **no existe el
archivo.** Enchufar un `Database` inventado (el de OpenAPI, sin las claves foráneas ni los tipos
finitos) habría producido una lista de errores que mezcla lo real con lo que la fuente derivada
no sabe ver. La clasificación de la Parte 3 —código mal / legacy declarado / tablas por materia—
no se puede hacer sobre una lista así, y una lista mala es peor que ninguna: la Parte 3 termina
con la instrucción de **no tocar más de diez archivos**, y ese umbral solo tiene sentido si los
errores son de verdad.

Lo que sí se adelantó de la Parte 3, con lo que se puede medir hoy, es la **forma** que tendrá esa
lista (§2, últimos tres puntos): la mayoría de los `.from()` pasan constantes, hay una tabla que no
existe (`archivos_calificaciones`) y 384 de las 424 relaciones son tablas por materia —que son,
literalmente, la categoría 3 que el prompt ya daba por no arreglable—.

Sobre el **CI**: el prompt decía «añade el paso de `--check` **solo si el workflow puede llegar a
la base**», y el workflow es deliberadamente de solo lectura del disco («NADA que toque Supabase
entra aquí»). **No se añadió**, por la misma razón que el prompt anticipa: no hay secreto
configurado y esa decisión no es de un agente. Queda junto al pendiente: cuando haya Docker o
token, el `--check` es un comando de mano hasta que alguien decida poner el secreto.

---

## 4 · Validación

| Comando | Resultado |
|---|---|
| `node scripts/gen-tipos-db.mjs` | **FALLA con diagnóstico legible** (Docker) — es el hallazgo de §1, y el script lo imprime en 3 líneas en vez de reventar |
| `node scripts/gen-tipos-db.mjs --check` | No se pudo correr: sin la CLI operativa no hay con qué comparar. Sale 1 con mensaje propio si el archivo no existe |
| `npx tsc --noEmit` | 0 errores (nada se enchufó al cliente, así que nada cambió) |
| `node scripts/test-orden.mjs` | 11 reglas, `Todo en orden` — **C10 en 34/34**, que es lo que prueba que la fila nueva del README está puesta |
| `node scripts/verificar-docs.mjs` | OK (`arranque 10 004 / 10 500` tokens) |
| `npm run test:ci` | exit 0 |
| `npm run lint` | 0 errores, 1 warning preexistente |
| `npm run build` | exit 0 (sin cambios que puedan afectarlo) |

Y la comprobación que sostiene todo el informe: `node -e "require('./docs/sistema/pendientes.json')"`
→ JSON válido, 14 pendientes, el último `tipos-db-sin-generar`.

---

## 5 · Qué se tocó y qué NO

**Tocado (4 archivos):**

- **Nuevo** `scripts/gen-tipos-db.mjs` — `LEE(red)`, dos modos (escribir / `--check`), cabecera
  «no editar a mano» dentro del archivo generado, versión de CLI **clavada** (porque `--check`
  compara su salida y una versión nueva daría desfase en falso), normalización de LF antes de
  comparar (Windows), y diagnóstico explícito si falta `DATABASE_URL` o si la CLI falla.
- `scripts/README.md` — fila del script + **etiqueta `LEE(red)` en la tabla de clasificación**,
  que no existía: el README clasificaba `LEE`, `LEE(fs)`… y ningún script leía por red. Sin esa
  fila, `gen-tipos-db.mjs` habría tenido que mentir con `LEE(fs)`.
- `docs/sistema/pendientes.json` — el pendiente `tipos-db-sin-generar`, con la decisión y el
  comando de verificación.
- `scripts/verificar-docs.mjs` — una excepción **con su motivo** para
  `lib/supabase/database.types.ts`: lo escribe el generador y hoy no puede correr. No es un
  documento podrido, es un archivo pendiente.

**NO tocado, pudiendo haberlo hecho:**

- **`lib/supabase/*.ts`**: ni una línea. El genérico **no** se enchufó, porque no hay tipo que
  enchufar. Es la Parte 2, y hacerla a medias habría dejado `tsc` y el build en rojo.
- **`supabase/*.sql`**: ninguno se editó ni se borró. Este prompt lee; no migra.
- **El esquema**: no se creó `archivos_calificaciones` ni se tocó `ciclo_escolar`. Los dos
  hallazgos van al informe y al pendiente, no a un `.sql` nuevo.
- **El CI**: sin paso `--check`, por la razón de §3.
- **Ninguna dependencia nueva**: el generador usa `npx` (la CLI, efímera) y `node:child_process`.
- `lib/auth/**`: intacto.

---

## 6 · Qué desbloquea esto, en un comando

1. **Instalar Docker Desktop** (o exportar `SUPABASE_ACCESS_TOKEN` y usar `--project-id`).
2. `node scripts/gen-tipos-db.mjs` → escribe `lib/supabase/database.types.ts`.
3. `npx tsc --noEmit` **antes** de tocar `lib/supabase/`: mide si el archivo entra en C9 (>1 000
   líneas) y si el repo compila tal cual.
4. `createClient<Database>(…)` en `lib/supabase/server.ts` y `service.ts` — y **parar ahí**: la
   lista de errores de `tsc` es la Parte 2, y su clasificación es la Parte 3.
5. `node scripts/gen-tipos-db.mjs --check` como comando de mano hasta que alguien decida si el
   secreto entra en el CI.


