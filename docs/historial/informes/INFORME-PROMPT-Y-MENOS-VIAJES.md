# INFORME — PROMPT Y · Menos viajes por sesión (meta: 500 usuarios sin cambiar de plan)

> Ejecutado el 2026-10-24 (23:00–23:45) por Claude, sin Cline, a pedido del usuario: «La versión de
> Supabase Pro hay que evitarla, implementa las soluciones que muestras y ejecuta tú el prompt».
> Prompt: `docs/historial/prompts/PROMPT_Y_MENOS_VIAJES_500_USUARIOS.md`. Medición previa:
> `docs/historial/informes/INFORME-FASE-11-RENDIMIENTO.md`. Sin commit.

## 1 · Qué se hizo

| # | Cambio | Archivo(s) | Efecto medido |
|---|---|---|---|
| A | **Spec OpenAPI con una sola descarga simultánea** (*single-flight*): la caché O3 guarda también la promesa en curso; una invalidación por DDL gana sobre una descarga a medias | `lib/escolar/openapi.ts` | sin estampida de descargas de 1 MB bajo carga (§3) |
| B | **El perfil ya no descarga el spec**: el nombre exacto de la tabla de registro se busca primero en la lista generada `REGISTROS_ESCOLAR`, y las columnas solo se piden si la tabla tiene filas (las 24 están vacías) | `catalogo/grupo-parse.ts`, `alumno/registro-estatus.ts`, `materia/hoja-tabla.ts` | perfil: −1 MB en frío, −1 viaje |
| C | **El perfil no repite inscripción → grupo → carrera**: con la RPC, el registro recibe la pertenencia ya resuelta (`pertenenciaDesdeCatalogo`, en `lib/`) | `alumno/registro-alumno.ts`, `app/actions/escolar.ts` | −3 viajes |
| D | **Foto en paralelo con la RPC**, en vez de después | `app/actions/escolar.ts` | p50 del perfil 717 → 430 ms |
| E | **Sin sondeos de esquema** antes de leer el calendario y los parciales: la lectura va directa y el «esquema pendiente» se deduce de su propio error. Las funciones de sondeo se conservan (CONTRATO 3) | `ciclo/calendario.ts`, `ciclo/evaluaciones.ts` | boleta −2, asistencia −2 |
| F | **La boleta pide el roster una sola vez** y se lo pasa (como promesa) al cálculo de asistencia | `administracion/boleta.ts`, `asistencia/asistencia-estados.ts` | boleta −1 |
| G | **Login sin ALUMNOS entero (C-1)**: `patronFiltroNombre` (módulo puro) da un ILIKE que trae un **superconjunto garantizado** de lo que el emparejamiento aceptaría; el emparejamiento no cambia | `nombres.ts`, `alumno/alumnos.ts`, suite nueva | login 57,7 → 4,8 KB |
| H | **Foto sin la Admin API**: `HEAD` a la CDN de Cloudinary (200/404), que no tiene el cupo de 500 llamadas/hora | `cloudinary/urls-server.ts`, `cloudinary/urls.ts` | 0 llamadas a la Admin API al leer perfiles |
| I | **Buscador de expediente**: 4 columnas en lugar de `*` | `catalogo/inscripciones-borrador.ts` | 65 → 47 KB |
| J | **scrypt asíncrono** en el login del tutor: corre en el pool de libuv y no bloquea la instancia | `tutores/tutores-credenciales.ts`, `auth/portal-login.ts` | mismo resultado; el hilo sigue atendiendo |
| K | **`/oceano` por rol**: los cinco contenidos con `next/dynamic` | `app/components/oceano/shell-oceano.tsx` | JS inicial 1 082 → 676 KB (gzip 294 → 203) |

## 2 · Quién lo ejecutó y qué pudo y no pudo hacer

| Agente | Qué hizo | Qué no pudo |
|---|---|---|
| Claude (redactor, implementador y auditor) | redactó y archivó el prompt, implementó A–K, escribió la suite, midió antes y después y escribió este informe | no pudo probar con una **sesión real** (solo hay cuentas reales): el login se probó con la función real y los datos reales, sin contraseñas; `/oceano` solo con el build |
| Cline | — | no intervino: el usuario pidió que lo ejecutara Claude |
| Auditor independiente | — | no hubo. La revisión la hizo el mismo agente; §5 y §7 dicen dónde mirar primero |

## 3 · Cómo se ejecutó y se midió (antes → después)

**Antes y después con el mismo instrumento**: `scripts/fase11-perfil.mjs --sujetos=3 --runs=3` (Server
Actions reales, usuarios reales) y la traza en orden de cada paso.

| Paso | Viajes antes → después | p50 antes → después | Recibido antes → después | Resultado |
|---|---:|---:|---:|---|
| login (alumno / tutor / docente) | 4 → 4 | 410–533 → 405–495 ms | **57,7 → 3,0–6,5 KB** | igual |
| alumno · perfil | 8,4 + Admin API → **6 + CDN** | **717 → 430 ms** | **155 → 43 KB** | igual |
| alumno · boleta | 16,3 → **13,7** | 830 → 698 ms | 24 → 23 KB | igual |
| alumno · asistencia | 11,3 → **9,7** | 814 → 671 ms | 21 → 23 KB | igual |
| tutor · perfil del hijo | 8,7 → 7 | 837 → 502 ms | 41 → 38 KB | igual |
| tutor · boleta | 14 → 8,7 | 872 → 296 ms | 16 → 8 KB | igual* |
| docente · hoja de materia | 2–3 (con spec) → 2 | 194 → 177 ms | — | igual |
| buscar expediente | 1 → 1 | 138 → 95 ms | 65 → 47 KB | igual |
| **sesión completa de alumno** | **55 → ~48** | | **266 → ~105 KB** | |
| **sesión completa de tutor** | **35 → ~28** | | **120 → ~60 KB** | |

\* Los usuarios se eligen al azar en cada corrida: en la de después, 2 de los 3 tutores tenían un hijo
sin materias, y su boleta sale «no disponible» antes de calcular nada. El resultado por tutor es el mismo.

**Login contra los datos reales** (script de un solo uso, solo cifras): 1 891 textos (el nombre de cada
uno de los 472 alumnos tal cual, sin acentos en minúsculas, en otro orden y cortado, más 3 que no son de
nadie) → **1 891 encuentran al mismo alumno que el login viejo, 0 distintos**. Media recibida: 2,1 KB
frente a 54,7 KB.

**Bundle** (manifiestos del build del CI): `/oceano` 1 082 → **676 KB** sin comprimir (gzip 294 → 203).
Al pintarse, cada rol baja además el chunk de su contenido (el del alumno, ~49 KB más los paneles que use).

**CI**: `npm run test:ci` en verde, 55/55 suites (la nueva incluida), tsc, lint (el aviso de siempre en
`gen-panel.mjs`), permisos, matriz, invariantes, RUMBO, estado, docs y build.

**Carga** (`fase11-carga.mjs`): ver §3b.

### 3b · Carga: 500 usuarios simultáneos, el mismo perfil realista de la FASE 11

`fase11-carga.mjs --usuarios=500 --rampa=30 --pausa=5000 --timeout=30000`: los 500 llegan en 30 s y
esperan 0–5 s entre pantallas. Plan gratuito de Supabase, sin cambios. Sábado 23:19–23:21.

| | FASE 11 (antes) | PROMPT Y (después) |
|---|---:|---:|
| sesiones completas | 70/500 | **471/500** |
| pasos fallidos | 22 % (y freno a los 4 min) | **0,8 %** (29 de 3 637) |
| peticiones servidas | 15 666 (1 632 con error) | **19 303** (30 cortadas a los 30 s) |
| duración | 241 s, cortada por el freno | **120 s**, completa |
| errores 5xx en el borde de Supabase (`edge_logs`) | cientos por minuto | **0** |
| descargas del spec OpenAPI en el minuto pico | hasta 57 (34–135 s cada una) | **5** |
| p50 del perfil / boleta / asistencia | 10 s / 132 s / 120 s | **2,7 s / 1,7 s / 0,7 s** |
| p95 del perfil / boleta | 167 s / 193 s | **36 s / 48 s** |
| la API, al terminar | se recuperó minutos después | **p50 50 ms en el minuto siguiente** |

**Lectura:** con el mismo plan, 500 usuarios simultáneos ya **no tiran el sistema**: 94 % de sesiones
completas, ningún 5xx en el borde y la API vuelve a la normalidad en cuanto baja la carga. La meta de
**holgura** no está cumplida: en el minuto pico (9 600 peticiones, ~160/s) el pool de PostgREST se llena
y la cola produce un p95 de 15–55 s (`PGRST003` aparece 3 veces). La mediana está bien; el 5 % más
lento, no.

«Admin API Cloudinary que se habría llamado: 449» cuenta llamadas a `obtenerUrlFotoPerfilSiExiste`, que
ahora son `HEAD` a la CDN y no gastan cupo. En la FASE 11, esas mismas 449 eran llamadas a la Admin API.

No se repitió el perfil en ráfaga (500 en 10 s con ≤ 1 s entre pantallas) para no saturar producción
otra vez. Pide el doble de peticiones por segundo que el realista, así que lo más probable es que siga
sin caber.

## 4 · Normas respetadas (CONTRATO §2)

| Punto | Cómo |
|---|---|
| 1 · medir antes | `fase11-perfil` y la traza, guardados antes de tocar código |
| 2 · lógica en `lib/` | la action solo pasa datos ya resueltos; `pertenenciaDesdeCatalogo` y `patronFiltroNombre` viven en `lib/` (el segundo, puro y con suite). `app/actions/escolar.ts` queda en 999 líneas (C9) |
| 3 · aditivo, sin borrar legacy | `verificarColumnaPeriodoIdCalendario` se conserva (`@deprecated`, sin consumidores) y `verificarEsquemaEvaluaciones` también; ningún SQL ni migración |
| 4 · sin camino paralelo | la pertenencia sale de la misma fuente (inscripción activa → grupo activo → carrera); `REGISTROS_ESCOLAR` ya era el respaldo del spec |
| 5 · validar | `npm run test:ci` + `test-login-filtro-nombres.mjs` |
| 6 · volver a medir | §3 |
| 7 · qué no se tocó | §6 |

## 5 · ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| §11 «revisar la consulta existente, agrupar» | **cumplido donde se medía el incumplimiento**: sondeos, pertenencia repetida, roster doble y spec para un nombre de tabla |
| §16 por capas | el cuello era la capa de datos y ahí se actuó: menos peticiones y más pequeñas. La caché del spec ya existía; solo se le quitó la estampida, no se añadió otra |
| R6 una sola fuente | sin fuentes nuevas |
| Seguridad del login | el filtro solo **reduce** las filas candidatas y la comparación de la clave no cambia. `verificarContraseñaTutor` es ahora asíncrona: se comprobó que sus tres llamadores la esperan (`tsc` rechaza asignar una promesa a `pwValida: boolean`), con un hash sintético se verificó correcta / mayúsculas / incorrecta / sin hash / hash roto |

## 6 · Desviaciones y decisiones propias

- **Pertenencia del perfil cuando hay varias inscripciones activas.** La RPC elige la más reciente;
  `resolverPertenenciaBoleta` devolvía vacío. Hoy hay **0** CURP con más de una activa y no hay índice
  que lo impida. Si llegara a pasar, el registro seguiría a la misma inscripción que el resto del perfil.
- **Calendario: un error que no sea de esquema** devuelve `[]`. Antes, el sondeo que fallaba por otra
  causa mandaba al camino por texto. Solo cambia la forma de fallar.
- **Supuesto del filtro del login:** los nombres solo llevan A-Z y Á É Í Ó Ú Ñ (medido). Una letra con
  otra marca (Š) escrita sin ella quedaría fuera; la suite lo deja escrito.
- **Datos:** hay 3 caracteres `�` (U+FFFD) en nombres de ALUMNOS, probablemente una Ñ que se perdió al
  importar. Esos alumnos ya hoy no pueden entrar escribiendo su nombre con Ñ. No se tocó: es corrección
  de datos (CONTRATO 3).
- **No tocado pudiendo hacerlo:** el catálogo del docente (13 viajes, el 6 % del tráfico), los sondeos de
  `justificaciones`, `materia-vista-alumno.ts` (las columnas deciden su filtro: es C-2), juntar
  `ALUMNOS` + `numero_control` de la boleta en una consulta (habría que cambiar un `select` genérico) y
  el panel de tutores (C-4, solo Administración).

## 6b · Qué falta para tener holgura a 500 sin cambiar de plan (siguiente prompt)

El cuello sigue siendo el número de peticiones en el minuto pico. Lo que más pesa ahora:

| Palanca | Ahorro estimado | Necesita |
|---|---|---|
| **RPC de boleta + asistencia** (`boletaDeAlumno` y `obtenerEstadosAsistenciaAlumno` en una función PL/pgSQL, como `obtener_perfil_alumno`) | sesión de alumno ~48 → ~28 peticiones; tutor ~28 → ~18 | SQL que aplica la persona |
| **El ciclo operativo resuelto una vez por petición** y no en cada función (`periodos` aparece en 5 de 8 pasos) | −3 a −5 por sesión | TS |
| Login: un solo viaje para PROFESORES + ALUMNOS + tutores (RPC de login) | −2 a −3 por login | SQL |
| Catálogo del docente (13 viajes) | −8 para el 6 % del tráfico | TS |

Con las dos primeras, la sesión de alumno quedaría cerca de la mitad que hoy. Por la medición, eso
basta para que 500 usuarios realistas quepan con p95 de pocos segundos.

## 7 · Lo no verificado

- **Sin sesión real**: `/oceano` con `next/dynamic` compila y el build lo sirve, pero nadie lo abrió con
  una cuenta. Al cambiar entre piezas de distinto rol (el directivo pasa de una pieza docente a una
  suya), la primera vez puede quedar un instante en blanco mientras baja el chunk.
- **Foto tras una subida:** el `HEAD` lleva un parámetro para no dejar un 404 guardado en la CDN, pero
  no se subió ninguna foto para comprobarlo.
- No se midió Vercel; ver el informe de la FASE 11, §7.
