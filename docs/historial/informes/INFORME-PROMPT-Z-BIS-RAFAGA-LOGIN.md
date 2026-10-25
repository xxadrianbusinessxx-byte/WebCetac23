# INFORME — PROMPT Z-bis · La ráfaga del login se degrada en vez de derrumbarse

> Ejecutado el 2026-10-25 (11:30–12:10) por Claude, sin Cline, a pedido del usuario: «Antes del commit,
> ataca la ráfaga del login: RPC de login y tope de peticiones simultáneas por instancia, y vuelve a medir
> los 500 en 10 s». Prompt: `docs/historial/prompts/PROMPT_Z_BIS_RAFAGA_LOGIN.md`. Base: el PROMPT Z sin
> commit. En paralelo trabajó otra sesión en el cierre de RLS (`INFORME-RLS-CERRAR-ANON.md`), en la misma
> carpeta.

## Resumen

| 500 usuarios en 10 s, ≤ 1 s entre pantallas | PROMPT Z | **Z-bis** |
|---|---:|---:|
| sesiones completas | 0/500 | **500/500** |
| pasos fallidos | 53 % (freno) | **0 %** |
| duración | 425 s, cortada por el freno | **37 s** |
| errores en el borde de Supabase | timeouts y 401/555 en cadena | **0** (p95 en origen 420 ms) |
| login p50 / p95 | 274 / 404 s | **0,7 / 1,6 s** |
| perfil p50 / p95 | 209 / 335 s | **1,9 / 3,4 s** |
| boleta p50 / p95 | — (nadie llegó) | **5,8 / 6,9 s** |

La ráfaga extrema **ya no tumba el sistema**: todos terminan, más despacio. El exceso espera en el servidor
en vez de amontonarse en Supabase.

## 1 · Qué se hizo

| # | Cambio | Archivo(s) |
|---|---|---|
| ZB1 | **RPC `candidatos_login`** (aplicada por la persona el 2026-10-25): profesores, alumnos candidatos (filtro superconjunto de `patronFiltroNombre`), tutor por usuario (ILIKE con `\ % _` escapados y `*` comodín, como PostgREST) o por clave (solo si hay exactamente uno) y los hashes iniciales del tutor elegido, en **una** petición. Solo `service_role`. No decide nada | `supabase/crear-rpc-candidatos-login.sql`, `scripts/diag-sql-aplicado.mjs` |
| ZB1 | **`FuenteLogin`**: `validarAccesoPortal` pregunta a una fuente (RPC o consultas de siempre) y decide con el mismo código. Sin la RPC, las consultas, y se recuerda 60 s que no existe. `portal-login.ts` pasa a imports relativos (C1) | `lib/auth/fuente-login.ts` (nuevo), `lib/auth/portal-login.ts` |
| ZB2 | **Tope de 12 peticiones simultáneas a Supabase por instancia**, cola FIFO, error inmediato tras 20 s de espera. Configurable: `SUPABASE_MAX_PETICIONES_SIMULTANEAS`, `SUPABASE_ESPERA_MAX_MS` | `lib/supabase/fetch-con-tope.ts` (nuevo), `service.ts`, `openapi.ts` (y `server.ts`, que la sesión de RLS dejó en `createServiceClient()`, que ya lo lleva) |
| ZB3 | Emparejamiento en funciones puras compartidas: `elegirProfesorPorNombre`, `elegirAlumnoPorNombre`, `verificarContraseñaEntreHashes` | `catalogo/profesores.ts`, `alumno/alumnos.ts`, `tutores/tutores-credenciales.ts` |
| — | Suites: `test-fetch-con-tope.mjs` (11) y `test-login-fuente.mjs` (22) | `scripts/` |

## 2 · Quién lo ejecutó y qué pudo y no pudo hacer

| Agente | Qué hizo | Qué no pudo |
|---|---|---|
| Claude (esta sesión) | todo lo anterior, la equivalencia con datos reales y las mediciones | aplicar el SQL; probar con una sesión real |
| Persona | aplicó `crear-rpc-candidatos-login.sql` | — |
| Sesión de RLS (en paralelo) | cambió `lib/supabase/server.ts` a `createServiceClient()` y avisó; mantuvo el tope | — |

## 3 · Cómo se midió

- **Equivalencia de candidatos con datos reales**: 2 358 identificadores (los 472 alumnos con y sin
  acentos, los 22 profesores, usuarios de tutor tal cual y en mayúsculas, claves de tutor en minúsculas,
  y `zz nadie`, `a%b_c*`, `TUT-NOEXISTE`). Para cada uno, profesor, alumno, tutor por usuario y tutor
  por clave según la RPC frente a las consultas de siempre: **2 358/2 358 iguales**. Todos fueron por RPC.
- **Equivalencia de decisiones** (`test-login-fuente.mjs`, hashes scrypt sintéticos): 15 casos con la misma
  decisión por las dos fuentes, y las decisiones esperadas (el inactivo no entra; con clave equivocada nadie
  entra; contraseña inicial de cualquier hijo).
- **Permisos de la RPC**: `anon` no puede ejecutarla y `service_role` sí.
- **Ráfaga** (tabla del resumen): `fase11-carga.mjs --usuarios=500 --rampa=10 --pausa=1000 --timeout=30000`.
- **Control: el tope no rompe lo normal** (escalera realista, llegada en 30 s, 0–5 s entre pantallas):

| Usuarios | Fallos | Req/s | login p50/p95 | perfil p50/p95 | boleta p50/p95 | catálogo docente p95 |
|---:|---:|---:|---:|---:|---:|---:|
| 250 (Z) → **Z-bis** | 0 → **0** | 90 → 79 | 0,4/0,5 → **0,1/0,2 s** | 0,4/0,5 → 0,4/0,5 s | 0,4/0,6 → 0,5/0,7 s | — → 1,3 s |
| 500 (Z) → **Z-bis** | 0 → **0** | 196 → 164 | 0,4/1,7 → **0,1/0,2 s** | 0,4/1,1 → 0,4/0,5 s | 0,4/2,0 → 0,5/1,0 s | — → 1,7 s |
| 800 (Z) → **Z-bis** | 0 → **0** | 287 → 226 | 0,5/1,9 → 0,5/2,2 s | 0,4/0,7 → 1,6/4,1 s | 0,5/0,8 → 3,8/6,7 s | — → 15 s |

**Lectura:** hasta 500 usuarios realistas, el login es **4 veces más rápido** y lo demás queda igual o
mejor. A 800 sigue habiendo 0 fallos, pero **más lento** que sin tope: con 12 por instancia, ahí el
límite es el propio tope (226 req/s frente a 287 sin él). Es el precio de que la ráfaga no derrumbe el
sistema. Se ajusta con `SUPABASE_MAX_PETICIONES_SIMULTANEAS`, sin tocar código.

## 4 · Normas respetadas

| Punto del CONTRATO | Cómo |
|---|---|
| 1 · medir antes | la ráfaga y la escalera del PROMPT Z |
| 2 · lógica en `lib/` | toda en `lib/`; ninguna action cambió |
| 3 · aditivo | la RPC es nueva; sin ella el login es el de siempre; nada borrado |
| 4 · sin camino paralelo | las dos fuentes deciden con las mismas funciones; la RPC replica las consultas, no inventa reglas |
| 5 · validar | `npm run test:ci` en verde (59/59) |
| 6 · volver a medir | §3 |

## 5 · ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| §16 por capas | el costo era de la capa HTTP de datos: menos peticiones en el paso crítico (RPC) y control de admisión antes de llegar a ella (tope). No se cachea nada personal |
| Seguridad del login | sin cambios en la comparación. La RPC devuelve al servidor lo mismo que ya leían las consultas y solo la ejecuta `service_role` |
| R6 una sola fuente | una sola decisión, dos orígenes de datos con las mismas reglas, comprobado con 2 358 identificadores reales |

## 6 · Desviaciones y decisiones propias

- **El tope es por instancia, no global.** En Vercel, el total en vuelo es instancias × 12. Con pocas
  instancias calientes, como es lo normal en Fluid, protege. Si Vercel abriera muchas instancias a la vez
  en un pico, la protección se diluye.
- **El turno se libera al llegar las cabeceras**, no al terminar de leer el cuerpo. Las respuestas son
  pequeñas; leer el cuerpo ya no ocupa a PostgREST.
- **Error tras 20 s en cola**: mejor un «inténtalo de nuevo» que una página colgada. En las mediciones
  nadie llegó a esperar tanto.
- **Mediciones con `server.ts` cambiando:** la sesión de RLS alternó versiones de `server.ts` mientras yo
  medía. En las dos versiones el cliente pasaba por el tope (la mía lo ponía en `server.ts` y la suya
  usa `createServiceClient()`), pero las primeras corridas pudieron hacerse con clientes distintos.

## 7 · Lo no verificado

- Sin sesión real ni medición en Vercel (cuántas instancias abre de verdad en un pico).
- El tope de 12 no se ajustó finamente. Entre 16 y 20 probablemente recupera el rendimiento a 800 sin
  perder la protección, pero cada prueba a 800 o en ráfaga carga producción.
