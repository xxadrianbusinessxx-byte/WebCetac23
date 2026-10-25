# INFORME — FASE 11 · Re-medición de rendimiento con el código vivo (meta: 500 usuarios simultáneos)

> Ejecutado el 2026-10-24 (sábado, 22:15–22:50 hora del plantel) por Claude, a pedido del usuario:
> «volver a medir … verificar que las aplicaciones de rendimiento no afecten la estructura ni
> comprometan funciones … como meta dejaremos 500 usuarios simultáneos». Base: `ebba3c1` (main = origin).
> Sucede a las FASES 0–10 de `docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md` y cierra el
> pendiente `remedir-rendimiento`. **No se cambió código de la app**: solo instrumentos de medición.

## Resumen en cinco líneas

1. **Nada se rompió.** CI completo en verde (54/54 suites, tsc, lint, permisos, build) y los 25 pasos
   de navegación medidos devuelven datos correctos en todos los roles. Las optimizaciones O1, O3, O5,
   O8, O9, A-1, 6A-2…6A-4 y el *lazy-load* de `xlsx` siguen en el código y funcionando.
2. **Hasta 250 usuarios en ráfaga: 0 fallos** (1 874 pasos, 429 req/s a Supabase), pero con p95 de 3–5 s.
3. **A 500 usuarios simultáneos el sistema colapsa**: Supabase devuelve 504 y
   `PGRST003 Timed out acquiring connection from connection pool`. Pasa en ráfaga y en un perfil más
   realista (llegada en 30 s, 0–5 s entre pantallas). **La meta de 500 no se cumple hoy.**
4. **El límite no está en la app sino en el plan gratuito de Supabase** (60 conexiones, CPU compartida),
   y la app lo agrava: una sesión de alumno hace **55 peticiones**, varias repetidas, y el spec OpenAPI
   de 1 MB se descarga en estampida bajo carga (llegó a tardar 135 s).
5. **Cloudinary también se queda corto a 500**: la Admin API tiene un cupo de 500 llamadas/hora y
   500 usuarios gastarían ~440 en su primera visita. Después, las fotos dejarían de verse durante una hora.

---

## 1 · Qué se hizo

| Parte | Qué | Resultado |
|---|---|---|
| A | CI completo antes de medir (`npm run test:ci`) | verde: 54/54 suites, permisos 748 ok, build ok |
| B | Instrumento nuevo `scripts/fase11-*.mjs` (perfil por rol + carga por usuarios) | ejecuta las **Server Actions reales**; ver §3 |
| C | Perfil por rol (3 usuarios reales × 3 vueltas, en serie) | §2.2 |
| D | JS inicial por ruta, desde el build | §2.4 |
| E | Carga: 100 → 250 → 500 usuarios en ráfaga y 500 en perfil realista | §2.5 |
| F | Diagnóstico de la caída con los logs de Supabase | §2.6 |
| G | Pendientes: `o1-rpc-sin-acotar` cerrado (estaba aplicado, el pendiente estaba viejo); `remedir-rendimiento` cerrado; 3 nuevos | §7 |

## 2 · Mediciones

### 2.1 Datos y tamaños (2026-10-24)

| Tabla / recurso | FASE 10 | FASE 11 |
|---|---:|---:|
| ALUMNOS | 471 | 472 |
| tutores · tutor_alumnos | 463 · 465 | 463 · 465 |
| asistencia_alumnos | 3 863 | 4 642 |
| calificaciones (normalizadas) | — | 451 |
| grupo_materias | 240 | 253 |
| tablas de materia legacy con filas | 0 | 0 (C-2 sigue costando cero) |
| **Spec OpenAPI** (`GET /rest/v1/`) | 887 KB · 284–510 ms | **1 003 KB · 313–378 ms** en reposo |
| scrypt del login de tutor | — | 27–33 ms de CPU **síncronos** por verificación |
| Admin API de Cloudinary | — | 323 ms por llamada · **cupo 500/hora** |

### 2.2 Perfil por rol (en reposo, sin carga)

p50 de 9 ejecuciones (3 usuarios × 3). «Viajes» = peticiones a Supabase que hace esa pantalla.

| Paso | p50 | Viajes | Recibido | Resultado |
|---|---:|---:|---:|---|
| portada · `leerPortadaPublica` | 193 ms | 4 | 2 KB | ok |
| login (alumno, docente o tutor) · `validarAccesoPortal` | 410–533 ms | 4 | **58 KB** (ALUMNOS completo, C-1) | camino completo |
| alumno · perfil `/oceano` | 717 ms | 8,4 | 43 KB (+1 MB de spec en frío) | ok |
| alumno · calificaciones (lista / materia) | 190 / 390 ms | 2 / 4 | 3 KB | ok |
| alumno · **boleta** | 830 ms | **16,3** | 24 KB | ok |
| alumno · **asistencia** | 814 ms | **11,3** | 21 KB | ok |
| alumno · reportes / justificantes | ~200 ms | 2 / 3 | <1 KB | ok (vacío) |
| tutor · perfil del hijo | 837 ms | 8,7 | 41 KB | ok |
| tutor · boleta | 872 ms | 14 | 16 KB | ok |
| docente · catálogo de materias | 973 ms | **13** | 24 KB | ok |
| directivo · catálogo (241 materias) | 723 ms | 7 | 183 KB | ok |
| directivo / admin · buscar expediente | 100–140 ms | 1 | **65 KB por 30 resultados** | ok |
| administración · panel de tutores (C-4) | 414 ms | 11 (O9: lotes de 50) | 251 KB | ok (463) |

**Sesión completa** (portada → login → todas sus pantallas):

| Rol | Peticiones a Supabase | Recibido |
|---|---:|---:|
| alumno | **55** | 266 KB |
| tutor | 35 | 120 KB |

Repetidas dentro de una sesión de alumno: `inscripciones_alumno` ×5, `grupo_materias` ×5,
`calendario_escolar` ×4 (32 KB), `periodos_evaluacion` ×4, `ALUMNOS` ×4, `justificaciones` ×4,
`periodos` ×3, `grupos` ×3, `tutores` ×3. Algunas se repiten **dentro de una misma action**:

- **`verificarColumnaPeriodoIdCalendario`** (`lib/escolar/ciclo/calendario.ts:298`) hace una consulta de
  sondeo antes de cada lectura del calendario, para saber si existe `periodo_id`. La columna existe y
  está poblada desde la migración F5. Es el «2× calendario_escolar» de boleta y asistencia.
- La boleta (`lib/escolar/administracion/boleta.ts:270`) resuelve el operativo y luego llama a
  `obtenerEstadosAsistenciaAlumno`, que lo vuelve a resolver. Lo mismo pasa con `periodos_evaluacion`
  y `ALUMNOS` (×2 cada uno).
- El perfil encuentra el nombre de su tabla de registro listando **todas** las tablas del spec OpenAPI
  (`grupo-parse.ts:55` → `listarRegistrosCompletos` → `obtenerSpecOpenAPI`). Por eso la ruta más
  caliente descarga 1 MB cada vez que caduca la caché de 60 s (O3).

### 2.3 ¿Siguen en pie las optimizaciones anteriores?

| Id | Qué hacía | Estado hoy | ¿Rompe algo? |
|---|---|---|---|
| RPC `obtener_perfil_alumno` (FASES 3-4) | 1 petición en lugar de ~21 | activa: 1 RPC de 43 KB por perfil | no; O-1 confirmado en la función viva |
| O1 | perfil en paralelo | sigue como *fallback* de la RPC | no |
| O3 | caché del spec 60 s | presente, **pero sin agrupar descargas simultáneas** (§2.6) | no, aunque se queda corta |
| O5 | caché de la foto 10 min/instancia | presente; insuficiente frente al cupo de Cloudinary (§2.5) | no |
| O8 / O9 | lotes `in()` de profesores, grupo_materias y credenciales | presentes (panel de tutores: 11 viajes para 463) | no |
| A-1 | portada sin el roster de ALUMNOS | superada: la portada ya no muestra «alumnos estrella» | no |
| 6A-2 · 6A-3 · 6A-4 | avatar transformado, sin descargas dobles, validación ligera | presentes | no |
| FASE 9 · `xlsx` diferido | 334 KB fuera de la carga inicial | **se mantiene**: SheetJS va en un chunk async de 411 KB que no está en ninguna entrada | no |

### 2.4 JavaScript inicial por ruta (build de producción, desde los manifiestos)

| Ruta | FASE 9 | FASE 11 sin comprimir | FASE 11 gzip |
|---|---:|---:|---:|
| `/` (portada) | 549 KB | 650 KB | 196 KB |
| **`/oceano`** (todos los roles) | — | **1 082 KB** | **294 KB** |
| `/perfil` `/profesor` `/directivo` `/tutor` `/configuracion` `/documentos` | 567–633 KB | 627 KB | 188 KB |

`/oceano` lleva en **un solo chunk de 413 KB** las piezas de los seis roles: un alumno descarga el panel
del técnico. Es coste de red del cliente, no de capacidad: el CDN de Vercel sirve los estáticos y no
toca Supabase. Queda como candidato B (§6), no como causa del colapso.

### 2.5 Carga: usuarios simultáneos con sesiones completas

8 procesos, que hacen de 8 instancias del servidor. Mezcla de un pico de boletas: alumno 55 %, tutor
35 %, docente 6 %, directivo 2 %, administración 2 %. El retraso del bucle de eventos de la máquina de
carga quedó ≤ 69 ms en todas las corridas: las cifras son del servidor, no del generador.

| Corrida | Llegada · pausa entre pantallas | Sesiones completas | Pasos fallidos | Req/s a Supabase | p50 / p95 del perfil | p50 / p95 de la boleta |
|---|---|---:|---:|---:|---:|---:|
| 100 usuarios | 10 s · ≤1 s | **100/100** | 0 % | 201 | 1,1 / 1,4 s | 0,85 / 1,1 s |
| 250 usuarios | 10 s · ≤1 s | **250/250** | 0 % | 429 | 2,4 / 3,6 s | 2,1 / 3,9 s |
| 500 usuarios (ráfaga) | 10 s · ≤1 s | **49/500** | **30 %** | colapso | 126 / 467 s | 147 / 525 s |
| 500 usuarios (realista) | 30 s · ≤5 s, tope 30 s por petición | **70/500** | **22 %** (freno a los 4 min) | colapso | 10 / 167 s | 132 / 193 s |

En 500 usuarios, la Admin API de Cloudinary **se habría llamado 432–448 veces** (se simuló; ver §3). El
cupo es de 500/hora para producción entera.

Comparado con la FASE 10: aquella medía 5 consultas sueltas y vio «0 errores hasta 1 000 concurrentes»
con ≤ 300 peticiones en vuelo. Medida con usuarios reales, que encadenan 35–55 peticiones cada uno, la
capa de datos se satura entre 250 y 500 usuarios.

### 2.6 Por qué colapsa (logs de Supabase, `postgrest_logs` y `edge_logs`)

- **Plan `free`** (`get_organization`): `max_connections = 60`, CPU compartida. PostgREST trabaja con un
  pool chico (11 conexiones `authenticator` en reposo).
- 22:29–22:34 y 22:46–22:48: ~1 350 respuestas **504** y `PGRST003 «Timed out acquiring connection from
  connection pool»`. El pico de entrada fue de 16 934 peticiones en un minuto.
- **El spec OpenAPI amplifica la caída.** Bajo carga, `GET /rest/v1/` pasó de 0,3 s a **34–135 s de
  media**, con hasta 57 descargas por minuto (57 MB que PostgREST tiene que generar). La causa es que
  `obtenerSpecOpenAPI` (`lib/escolar/openapi.ts:44`) guarda el resultado, pero no la descarga en curso:
  si la caché está vacía o caducó, **cada petición simultánea descarga su propia copia**. En Vercel pasa
  igual en cada instancia nueva y cada 60 s en las que tienen tráfico.
- Al saturarse, no se degrada poco a poco: las peticiones se encolan y la API tarda minutos en
  recuperarse. Se comprobó que **volvió a responder normal** (200 en ~120–170 ms) a las 22:43 y a las 22:49.
- Fuera de la prueba: los «Thread killed by timeout manager» aparecen 1–5 veces por minuto todo el día.
  Son ruido normal de PostgREST, no un síntoma. También aparece cada ~10 min
  `function actualizar_etiquetas_personales_desde_materias() does not exist`, que **no es de esta fase**:
  un job de `pg_cron` llama a una función que ya no existe (ver §7).

## 3 · Cómo se midió

**Instrumento nuevo**, porque el de la FASE 10 copiaba consultas a mano y ya no coincidían con el código:

| Archivo | Etiqueta | Qué hace |
|---|---|---|
| `scripts/fase11-entorno.mjs` | — | carga `app/actions/*.ts` y `lib/` fuera de Next: sustituye `next/headers`, `next/navigation` y `server-only`, y sirve la sesión del usuario virtual desde `AsyncLocalStorage`. **No se firma ni falsifica ninguna cookie**, y `exigir()`/`puede()` corren tal cual. Cuenta cada viaje de red (`fetch` y `https` por `diagnostics_channel`) y oculta las CURP de las rutas |
| `scripts/fase11-escenarios.mjs` | — | qué hace cada rol al entrar, sacado de `app/oceano/page.tsx` y de las piezas del shell; elige usuarios reales al azar |
| `scripts/fase11-perfil.mjs` | `LEE(red)` | §2.1–§2.2 |
| `scripts/fase11-carga.mjs` | `CARGA` | §2.5; tope por petición y freno al pasar del 10 % de fallos |

- **Login sin contraseñas:** se usa una clave falsa. El camino es el mismo hasta comparar la clave (y en
  el tutor, hasta el scrypt). No se lee, imprime ni compara ninguna contraseña real.
- **Cloudinary no se tocó en la carga:** se sustituyó por una espera de 300 ms (la latencia medida) y se
  contaron las llamadas. En el perfil se gastaron ~20 llamadas del cupo horario.
- **Bundle:** `page_client-reference-manifest.js` + `build-manifest.json` del build del CI, sin y con gzip.
- **Lo que este método no mide:** el coste del propio Vercel (arranque en frío, límite de duración de las
  funciones, CPU compartida entre peticiones de una instancia *Fluid*). Mide la app real contra la base
  real desde un PC. Ver §7.

## 4 · Normas respetadas

| Norma | Cómo |
|---|---|
| AGENTS «medir antes de modificar» | no se cambió código de la app; esta fase solo mide |
| CONTRATO §1.3 (ningún SQL sin autorización) | solo `SELECT` (`pg_get_functiondef`, `pg_settings`, `pg_stat_*`) y logs |
| ORDEN §4 (scripts) | cabecera qué mide / qué escribe / cómo; fila en `scripts/README.md`; `CARGA` detrás de `--confirmar-carga`; C6 y C10 de `test-orden` en verde |
| scripts/README «Credenciales» | sin claves ni CURP en la salida; la ruta de la foto se enmascara |
| CARGA «una persona, con autorización y fuera de horario» | la pidió el usuario; sábado 22:28–22:49 |
| R6 (una sola fuente) | los escenarios llaman a las actions; no copian consultas |

## 5 · ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| §11 Rendimiento («revisar la consulta existente, agrupar en lote») | **se incumple en tres sitios medidos**: el sondeo de columna del calendario, el operativo resuelto dos veces en la boleta y el spec de 1 MB para encontrar una tabla de registro |
| §16 Optimización por capas | el cuello es la **capa de datos** (pool y CPU de PostgREST/Postgres). La solución va en esa capa: menos viajes, una RPC en lugar del spec y más cómputo. Una caché en el frontend sería disfrazar el problema |
| Ninguna optimización anterior rompe la estructura | confirmado (§2.3 y CI en verde) |

**Veredicto:** la arquitectura está sana y las optimizaciones anteriores aguantan. La capacidad no llega
a 500 usuarios simultáneos por dos razones independientes: el plan de infraestructura y el número de
viajes por sesión. Hacen falta las dos palancas.

## 6 · Qué haría falta para 500 usuarios (con holgura)

Estimación con lo medido: el plan gratuito sostiene ~400 req/s con latencia degradada y colapsa por
encima. 500 usuarios entrando en el mismo minuto, a 55 peticiones cada uno, piden ~2× eso.

| # | Palanca | Capa | Quién | Efecto esperado |
|---|---|---|---|---|
| 1 | **Plan Pro de Supabase** con cómputo dedicado (Micro o Small): más conexiones, pool mayor, CPU sin compartir y **sin pausa por inactividad** | infra | **persona** (cuesta dinero) | sube el techo; es la palanca de mayor efecto |
| 2 | **Foto de perfil persistida** (P0-3/6B): `guardarUrlFotoPerfil` guarda la URL y el perfil ya no pregunta a la Admin API | datos/externo | Cline + SQL que aplica la persona | evita agotar el cupo de 500/hora con 500 usuarios |
| 3 | **Spec OpenAPI**: agrupar las descargas simultáneas (guardar la promesa) y una RPC que liste las tablas (C-3) | servidor/datos | Cline (+ SQL de la RPC) | quita el amplificador del colapso y 1 MB en frío |
| 4 | **Menos viajes por sesión**: quitar `verificarColumnaPeriodoIdCalendario`, pasar el operativo ya resuelto de la boleta a la asistencia y no repetir ALUMNOS ni `periodos_evaluacion` | datos | Cline | sesión de alumno de 55 → ~40 peticiones (estimado) |
| 5 | **Login sin descargar ALUMNOS** (C-1): filtro en servidor o RPC; hoy 58 KB por intento | datos | Cline + prueba de regresión del emparejamiento de nombres | −55 KB y −1 consulta pesada por login |
| 6 | Buscador de expediente: devolver solo las columnas que pinta (65 KB por 30 resultados) | datos | Cline | bajo |
| B | `/oceano`: cargar por rol las piezas pesadas (`next/dynamic`) | frontend | Cline | −~200 KB de JS para el alumno; no afecta la capacidad |
| B | scrypt síncrono en el login del tutor (27–33 ms bloquea la instancia; ×2 por hijo con la clave inicial) | servidor | Cline (`crypto.scrypt` asíncrono) | menos bloqueo en instancias con peticiones simultáneas |

Orden recomendado: **2 y 3 primero** (riesgo de producción a cualquier escala y amplificador, baratos),
luego **4 y 5**, y **volver a medir con `fase11-carga.mjs` a 250 y 500**. La decisión 1 se puede tomar
en paralelo. Sin ella es probable que 500 en ráfaga siga sin caber, porque el plan gratuito también
comparte CPU.

## 7 · Lo no verificado y lo pendiente

- **La caída afectó a producción.** La prueba saturó la API de Supabase de producción unos 5 minutos
  (22:29–22:34) y unos 3 más en la segunda corrida (22:46–22:48). Las dos veces se recuperó sola en
  menos de un minuto tras parar. No hay staging (README de `scripts/`): la próxima medición a 500 debería
  hacerse con el plan nuevo o avisando antes.
- La corrida realista empezó 2 minutos después de la primera. Con CPU compartida, parte de su peor
  resultado puede venir de la anterior. Es una cifra prudente, no exacta.
- No se midió Vercel: arranques en frío, límite de duración de las funciones ni concurrencia por
  instancia. El servidor fue un PC con 8 procesos.
- El perfil «realista» sigue siendo exigente (≤ 5 s entre pantallas). Una navegación humana típica
  (10–20 s por pantalla) repartiría la carga. Con lo medido, ~440 usuarios entrando en el mismo minuto
  es el orden de lo que cabe hoy.
- No se probaron escrituras bajo carga (subir asistencia o calificaciones): en un pico de boletas casi
  todo es lectura.
- Fuera de esta fase: `actualizar_etiquetas_personales_desde_materias()` no existe, y el job de
  `pg_cron` `actualizar-etiquetas-automatizado` (`*/10 * * * *`, activo) la llama igual: 144 fallos al día
  sin efecto. Retirarlo es decisión de la persona (pendiente `funcion-etiquetas-inexistente`).
