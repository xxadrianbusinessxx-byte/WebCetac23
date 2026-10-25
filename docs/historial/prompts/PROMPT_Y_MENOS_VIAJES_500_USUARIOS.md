# PROMPT Y — Menos viajes por sesión para acercarse a 500 usuarios sin cambiar de plan

> Redactado y ejecutado por Claude el 2026-10-24, a pedido del usuario: «La versión de Supabase Pro hay
> que evitarla, implementa las soluciones que muestras y ejecuta tú el prompt». Base: `ebba3c1` más la
> FASE 11 sin commit (`docs/historial/informes/INFORME-FASE-11-RENDIMIENTO.md`).

## OBJETIVO

Que una sesión de alumno o tutor gaste **bastantes menos peticiones** a Supabase y a la Admin API de
Cloudinary, **sin cambiar lo que ve nadie**. El techo del plan gratuito (60 conexiones, CPU compartida)
no se toca: se toca lo que la app le pide. Al terminar:

1. Ningún perfil descarga el spec OpenAPI (1 MB). Cuando otra pantalla lo necesite, las peticiones
   simultáneas de una instancia comparten **una sola** descarga.
2. Leer el calendario o los parciales cuesta **una** consulta, no dos (sin sondeo de esquema previo).
3. El perfil no vuelve a resolver inscripción → grupo → carrera: ya se los dio la RPC.
4. La boleta pide el roster de materias **una** vez y lo comparte con la asistencia que calcula.
5. El login no descarga ALUMNOS entero (C-1): un filtro en el servidor trae un **superconjunto
   garantizado** de las filas que el emparejamiento en JS aceptaría, y el emparejamiento es el mismo.
6. La existencia de la foto de perfil se pregunta a la **CDN** (HEAD), no a la Admin API (cupo 500/hora).
7. El buscador de expediente pide solo las 4 columnas que usa.
8. El scrypt del login del tutor no bloquea el hilo (asíncrono).
9. `/oceano` no descarga el contenido de los seis roles: cada rol carga el suyo.

## CONTEXTO (presupuesto acotado)

`docs/historial/informes/INFORME-FASE-11-RENDIMIENTO.md` (§2.2, §2.6, §6) · `filosofia.estructural` §11,
§14 y §16 · `docs/normativo/CONTRATO-DE-CAMBIO.md` · `scripts/README.md` (filas `fase11-`).

## ESTADO ACTUAL (medido el 2026-10-24 con `fase11-perfil.mjs` y la traza por paso; no re-investigar)

| Pantalla | Viajes | Duplicados, en orden |
|---|---:|---|
| login (cualquiera) | 4 | `ALUMNOS` completo, 54,7 KB (`lib/escolar/alumno/alumnos.ts:76`) |
| perfil del alumno | 11 | RPC; Cloudinary Admin API; `inscripciones_alumno`, `grupos` y `carreras` (otra vez, en `registro-alumno.ts:47`); `GET /rest/v1/` 1 MB (`grupo-parse.ts:55` → spec) |
| boleta | 17 | `periodos_evaluacion` ×2 (sondeo `verificarEsquemaEvaluaciones`); `calendario_escolar` ×2 (sondeo `verificarColumnaPeriodoIdCalendario`); `grupo_materias` ×2 (`materiasDelAlumno` en `boleta.ts` y dentro de `obtenerEstadosAsistenciaAlumno`) |
| asistencia | 12 | `periodos_evaluacion` ×2 y `calendario_escolar` ×2, los mismos sondeos |
| hoja de materia del docente | 3 | spec de 1 MB para listar columnas |
| buscar expediente | 1 | `ALUMNOS select(*)`, 65 KB para 30 resultados |

Solo existen 2 fotos de perfil en Cloudinary: casi todas las llamadas a la Admin API contestan «no hay».
La CDN responde 200/404 a un `HEAD` sin tocar el cupo (probado el 2026-10-24).
`inscripciones_alumno`: 0 CURP con más de una inscripción activa.

## DECISIONES TOMADAS

- **Sin SQL.** Todo se resuelve en TypeScript; ningún `.sql` nuevo (la persona no tiene que aplicar nada).
- **Spec:** la caché O3 guarda también la **promesa en curso** (*single-flight*). El TTL sigue en 60 s y
  la invalidación tras DDL no cambia.
- **Registro del perfil:** primero el nombre exacto candidato contra la lista generada
  `REGISTROS_ESCOLAR` (24 tablas, la misma que ya era el respaldo cuando el spec falla). Solo si no
  aparece se recurre al spec, como hoy.
- **Sondeos:** la lectura va directa. Si falla con el error de «columna o tabla inexistente», se aplica
  el mismo camino que daba el sondeo (texto legacy en el calendario; `ERROR_ESQUEMA_EVALUACIONES_PENDIENTE`
  en los parciales). Las funciones de sondeo **se conservan** (CONTRATO 3: no borrar legacy).
- **Pertenencia del perfil:** con la RPC, el registro usa el grado, grupo y carrera de `grupoCatalogo`.
  Sin RPC (fallback O1), se resuelve como hoy.
- **Login:** el patrón del filtro sale de un módulo **puro** (`nombres.ts`) con su suite. Toma el token
  más informativo del texto normalizado y sustituye por `_` cada letra que tenga variante acentuada
  (A E I O U N C Y). Si ningún token sirve, no se filtra (comportamiento de hoy).
- **Foto:** `HEAD` a la URL original de la CDN con un parámetro que evita su caché, para que un 404
  previo a una subida no se quede guardado. Se mantiene la caché O5. La Admin API ya no se llama al leer.
- **`/oceano`:** `next/dynamic` para los cinco contenidos por rol; los tipos siguen importándose estáticos.

## MEDICIÓN

Antes: `fase11-perfil.mjs --sujetos=3 --runs=3` (guardado en la FASE 11) y la traza por paso.
Después: lo mismo, y `fase11-carga.mjs --confirmar-carga` a 250 y a 500 (perfil realista, con freno).

## RESULTADO ESPERADO

Sesión de alumno de 55 a ~40 peticiones; perfil sin spec ni Admin API; login de 58 KB a ~1 KB; mismas
respuestas en los 25 pasos (`resultado:` igual que antes); CI en verde.

## REGLAS / SEGURIDAD / RENDIMIENTO

- Ninguna respuesta cambia para el usuario. Los mensajes de «esquema pendiente» se conservan.
- El filtro del login es un superconjunto: nunca puede dejar fuera una fila que hoy entraría.
- No se toca la autorización (`exigir`, `resolverAccesoAlumno`).

## ALCANCE

SÍ: `lib/escolar/openapi.ts`, `catalogo/grupo-parse.ts`, `alumno/registro-alumno.ts`, `ciclo/calendario.ts`,
`ciclo/evaluaciones.ts`, `administracion/boleta.ts`, `asistencia/asistencia-estados.ts`, `alumno/alumnos.ts`,
`nombres.ts`, `cloudinary/urls-server.ts`, `catalogo/inscripciones-borrador.ts`,
`tutores/tutores-credenciales.ts`, `auth/portal-login.ts`, `app/actions/escolar.ts` (solo pasar datos ya
resueltos), `app/components/oceano/shell-oceano.tsx`, y una suite nueva.
NO: SQL, RLS, permisos, el catálogo del docente (13 viajes, 6 % del tráfico: otro prompt), los sondeos
de justificaciones, ni el plan de Supabase.

## VALIDACIÓN

`npm run test:ci` · `node scripts/test-login-filtro-nombres.mjs` · `fase11-perfil` antes/después ·
`fase11-carga` a 250 y 500.

## INFORME

`docs/historial/informes/INFORME-PROMPT-Y-MENOS-VIAJES.md`, con las 7 secciones de ORDEN §6.

## CONTRATO

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
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```
