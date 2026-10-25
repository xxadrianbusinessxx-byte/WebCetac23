# INFORME — Cerrar la clave anon: el servidor con service_role y RLS sin políticas

> Ejecutado el 2026-10-25 por Claude, en una sesión lanzada por la que cerró la campaña de
> rendimiento (FASE 11 / PROMPT Y / PROMPT Z), sin Cline. Pendiente: `rls-tablas-publicas`
> de `docs/sistema/pendientes.json`. **Sin commit.** El `.sql` **no está aplicado**: lo aplica
> la persona, y solo DESPUÉS de desplegar el cambio de código (§6, orden obligatorio).

## 1 · Qué se hizo

| # | Cambio | Archivo(s) | Efecto medido |
|---|---|---|---|
| A | **El servidor lee y escribe con service_role.** `createClient()` devuelve `createServiceClient()` (y lanza si falta `SUPABASE_SERVICE_ROLE_KEY`) en vez de `createServerClient` de `@supabase/ssr` con la clave anon y las cookies. La app no usa Supabase Auth (la sesión es la cookie propia de `lib/auth/`), así que las cookies no aportaban nada. Un solo punto: los ~230 `await createClient()` de 31 archivos no cambian | `lib/supabase/server.ts` | 25/25 pasos del perfil iguales, mismos viajes (§3) |
| B | **El SQL que cierra anon**, en bloques idempotentes: 1) RLS y fuera las políticas en las 24 tablas con contraseñas o datos personales; 2) lo mismo en TODAS las demás de `public`, recorriendo el catálogo (las ~384 físicas de materia incluidas); 3) `escolar_agregar_columnas` y `escolar_sync_columns` (SECURITY DEFINER, cambian el esquema) solo para service_role; 4) event trigger `ensure_rls` que activa RLS en cada tabla nueva (ejemplo de la documentación de Supabase). Lleva su consulta de verificación y la reversión comentada | `supabase/crear-rls-cerrar-anon.sql` | sin aplicar |
| C | **Diagnóstico de solo lectura**: filas que ve anon frente a service_role por tabla sensible, con `HEAD` y `count=exact` (no baja ninguna fila) | `scripts/diag-rls-anon.mjs` + fila en `scripts/README.md` | antes: anon ve 21 de 21 |
| D | **Dos reglas nuevas en `test-orden`**: **C19** (dura) ningún cliente de datos con la clave anon/publicable fuera de `proxy.ts`, `env.ts` y el respaldo del spec en `openapi.ts`; **C20** (trinquete 27) ningún `.sql` nuevo crea una política `true` ni da GRANT a anon | `scripts/test-orden.mjs`, `docs/normativo/ORDEN.md` §5 | 20 reglas en verde |
| E | Documentación: la línea de RLS de `ESTADO-ACTUAL.md` §4 y el pendiente con su orden de aplicación | `ESTADO-ACTUAL.md`, `docs/sistema/pendientes.json`, `RUMBO.md` (generado) | — |

### Inventario: quién usaba anon (paso 1 del encargo)

| Cliente | Dónde | Qué hace |
|---|---|---|
| `createClient()` — **anon** hasta hoy | 31 archivos: 29 de `app/actions/`, `app/page.tsx`, `app/oceano/page.tsx`; ~230 llamadas | casi todo: portada, login, catálogos, calificaciones, asistencia, boleta, tutores, expediente, Storage de calificaciones y documentos |
| `clienteLecturaEscolar(sesion)` → service_role | 1 llamada (`escolar.ts`) y 6 en `documentos.ts` | el perfil (RPC `obtener_perfil_alumno`, ya solo de service_role) |
| `createServiceClient()` directo | `contexto-ciclo.ts`, `documentos.ts` (7), `justificaciones.ts` (2), `lib/auth/fuente-login.ts` (RPC `candidatos_login`) | escrituras de documentos y justificantes, buckets de Storage |
| clave anon sin datos | `proxy.ts` (`auth.getUser()`), `lib/escolar/openapi.ts` (respaldo del spec) | no leen tablas |

Producción usaba las dos claves: en los registros de la API (24 h), las peticiones desde AWS
(Vercel) llevan `sb_publishable_…` (~2 470) y `sb_secret_…` (~178). La clave secreta ya está en
Vercel; si no lo estuviera, el cambio A lanzaría en cada petición con un mensaje claro.

Medido con la clave anon **invalidada** y el código anterior, 23 de los 25 pasos del perfil
fallan o vuelven vacíos (portada, login, calificaciones, boleta, asistencia, catálogo del
docente y del directivo, panel de tutores, expediente…): esa es la dependencia real de anon,
y lo que el SQL rompería si se aplicara antes de desplegar A.

Lo que encontró el inventario y el pendiente no decía: Storage ya estaba cerrado (6 buckets
privados, 0 políticas), así que las subidas de calificaciones que iban con anon
(`lib/calificaciones/storage.ts`) fallaban; con service_role pasan a funcionar. Y las dos RPC
de columnas dinámicas, SECURITY DEFINER, eran ejecutables por anon: con la clave publicable
se podían añadir y quitar columnas de cualquier tabla.

## 2 · Quién lo ejecutó y qué pudo y no pudo hacer

| Agente | Qué hizo | Qué no pudo |
|---|---|---|
| Claude | inventario, diseño, cambio A, SQL, diagnóstico, reglas C19/C20, mediciones e informe | **aplicar el SQL** (el clasificador bloquea DDL con `execute_sql`; regla del repo: lo aplica la persona) y, por tanto, medir el advisor «después»; leer las variables de Vercel (403 de alcance: se dedujo de los registros de la API); probar con una sesión real |
| Cline | — | no intervino |
| Otra sesión en la misma carpeta | trabajaba a la vez en el PROMPT Z-bis (`candidatos_login`, `fuente-login.ts`, `openapi.ts`) | — ; por eso este cambio no toca `openapi.ts` y C19 lo permite con su motivo |

## 3 · Cómo se ejecutó y se midió (antes → después)

**CI** — `npm run test:ci`: antes en verde (57/57 suites, 18 reglas de `test-orden`, lint con
1 aviso previo en `gen-panel.mjs`, build); después en verde (59/59 —las dos de más las añadió
la otra sesión entretanto—, 20 reglas, el mismo aviso de lint, build). `tsc --noEmit` limpio.
C19 se comprobó contra el `server.ts` anterior: lo habría marcado.

**Perfil** — `node scripts/fase11-perfil.mjs --sujetos=3 --runs=3 --sin-cloudinary`, con
`Math.random` sembrado por una precarga (`--import`, fuera del repo) para que las tres pasadas
elijan los MISMOS alumnos, tutores y profesores. Comparado paso a paso: qué devolvió y viajes
a Supabase.

| Pasada | Resultado frente a «código anterior» |
|---|---|
| código anterior | referencia |
| código nuevo | **25/25 pasos iguales**, mismos viajes (0 de más) |
| código nuevo, clave anon invalidada | 25/25 mismo resultado; 24/25 mismos viajes (el otro: «directivo · ciclo operativo» 0 → 0,11, la caché de 20 s de `cache-referencia` caducó entre ejecuciones) |
| código anterior, clave anon invalidada | **2/25** iguales: 23 pasos fallan o vuelven vacíos |

La pasada «nuevo + anon invalidada» es la prueba de que ningún paso medido depende ya de
anon: es lo que verá la app con el SQL aplicado.

**diag-rls-anon** — antes del SQL: anon ve filas en 21 de 21 tablas sensibles, las mismas que
service_role (PROFESORES 22, ALUMNOS 472, tutores 463, tutor_credenciales_iniciales 455,
ETIQUETAS PERSONALES 328, asistencia_alumnos 4 642, calificaciones 451…). Después: pendiente
de aplicar el SQL; esperado 0 para anon y lo mismo para service_role.

**Advisor** (`get_advisors security`) — antes: `rls_disabled_in_public` ERROR ×401,
`function_search_path_mutable` WARN ×9, `extension_in_public` ×1,
`anon_security_definer_function_executable` ×2, `authenticated_security_definer_function_executable`
×2. Después del cambio de código (medido otra vez): idéntico, porque el SQL no está aplicado.
Esperado tras aplicarlo:
`rls_disabled_in_public` 0, los dos `*_security_definer_function_executable` 0, y
probablemente un INFO `rls_enabled_no_policy` por tabla (es el estado buscado: «RLS sin
políticas» = solo service_role). `function_search_path_mutable` y `extension_in_public` no
son de este pendiente.

**Base, por SQL de solo lectura** — 432 tablas en `public`: 401 sin RLS, 31 con RLS y 32
políticas, todas `true` para `public`; service_role tiene SELECT/INSERT/UPDATE/DELETE en las
432, USAGE en las 387 secuencias y EXECUTE en todas las funciones, y `bypassrls`: el cambio A
no pierde ningún permiso.

## 4 · Normas respetadas (CONTRATO §2)

- **Alcance**: solo `lib/supabase/server.ts` en código de la app. No se tocaron las ~230
  llamadas, ni `clienteLecturaEscolar` (ahora redundante, se deja: R8), ni `openapi.ts`, ni
  los `.sql` antiguos.
- **Capas**: el cliente sigue en `lib/supabase/`; ninguna action cambió.
- **Datos**: ni una fila. El `.sql` no toca datos ni columnas; está versionado en `supabase/`
  con verificación y reversión.
- **Identidad**: no aplica (no cambia quién es quién).
- **Verificación**: `test:ci` en verde; antes/después con el mismo script y los mismos
  sujetos; nada de `_peligrosos/` ni `_archivo/`.
- **Documentación**: `ESTADO-ACTUAL.md` (cambió una regla de seguridad), ORDEN §5, el
  pendiente, `gen-rumbo`, fila del script nuevo.

## 5 · ¿Sigue la filosofía y la arquitectura?

Sí, y la vuelve honesta. `ESTADO-ACTUAL` ya decía «RLS no autoriza nada; la autorización vive
en TypeScript»; las políticas `true` fingían una red que no existía y dejaban la puerta abierta
a quien tuviera la clave publicable. Ahora RLS hace una sola cosa —cerrar `anon`— y la
autorización sigue en un sitio (`exigir()` y el alcance por rol). El cambio de cliente es un
punto (R6: no hay dos formas de abrir la base) y C19 lo convierte en regla que una máquina
vigila. Lo que **no** cambia: un bug de autorización en TS sigue siendo un bug de seguridad
sin red debajo; service_role lo hace explícito, no lo crea.

## 6 · Desviaciones y decisiones propias

1. **Orden obligatorio**: commit → despliegue en Vercel → SQL. Al revés, la app se queda sin
   datos (medido: 23/25). Comprobación previa en el `.sql`.
2. **`DROP POLICY`** pese a «sin DROP» (ORDEN §5): son políticas, no datos ni columnas, y
   dejarlas es dejar la puerta abierta. La reversión las recrea tal cual.
3. **Todo `public`, no solo las tablas sensibles**: el bloque 2 recorre el catálogo. Una
   lista se queda vieja; las tablas de materia llevan CURP y notas. Si algo necesitara anon,
   C19 ya lo habría marcado en el código.
4. **No se revocan los GRANT de tablas a anon**: RLS sin políticas basta (0 filas, toda
   escritura rechazada) y la reversión queda en tocar solo RLS.
5. **Los `.sql` antiguos no se editan** (son la memoria del esquema), pero re-ejecutar uno
   reabre su tabla. Queda escrito en la cabecera del `.sql` y en el pendiente; C20 impide que
   uno nuevo añada otra apertura.
6. **El event trigger filtra dentro de la función**, no con `WHEN TAG`, porque la etiqueta
   literal de «crear tabla como consulta» la lee C15 como una tabla llamada «AS».
7. **`createClient()` lanza si falta la clave** en vez de caer a anon: con el SQL aplicado,
   caer a anon sería devolver vacío en silencio.
8. **Diagnóstico sin RPC**: con la clave publicable Supabase ya no sirve el spec OpenAPI
   (401) y probar una RPC es ejecutarla. Lo cubre la consulta final del `.sql`.

## 7 · Lo no verificado

- **El SQL no se ha ejecutado nunca**: ni su sintaxis contra la base. Primer sitio donde
  mirar si falla: el `do $BLOQUE$` del bloque 2 y el `create event trigger` del 4 (requiere
  el usuario `postgres`, que tiene el SQL Editor).
- **El advisor «después»** y `diag-rls-anon` «después»: dependen de aplicar el SQL.
- **Sesión real en producción** tras el despliegue (login, perfil, subir calificaciones,
  documentos, justificantes): el perfil ejecuta las Server Actions reales, pero sin
  navegador ni Vercel. Las escrituras no las mide el perfil (es de solo lectura); con
  service_role no pueden perder permisos (§3), pero no se ejercitaron.
- **Subida a Storage de calificaciones**: con anon fallaba (buckets privados); con
  service_role debería funcionar. No probado.
- **Las variables de Vercel**: deducido de los registros (peticiones `sb_secret_…` desde
  AWS), no leído.
