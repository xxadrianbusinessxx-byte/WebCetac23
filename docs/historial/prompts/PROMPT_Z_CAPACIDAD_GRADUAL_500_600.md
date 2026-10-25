# PROMPT Z — Capacidad que aguante de forma gradual hasta 500–600 usuarios, sin cambiar de plan

> Redactado y ejecutado por Claude el 2026-10-25, a pedido del usuario: «ejecuta el prompt Z y revisa que
> la optimización no solo sea un benchmark común (… debe aguantar gradualmente de 0 a 500 usuarios
> simultáneos 250, 300, 400, etc. el límite debería oscilar entre 500 a 600)». Base: `b9038cf` (en origin).
> Sin Supabase Pro (decisión del usuario, 2026-10-24).

## OBJETIVO

Que la capacidad **se degrade de forma gradual y predecible** al subir de 100 a 600 usuarios simultáneos
(perfil realista de la FASE 11), sin colapso ni salto brusco, con el límite útil entre 500 y 600. Se
demuestra con una **escalera** de cargas (100, 200, 250, 300, 400, 500, 600), no con un punto suelto.

## ESTADO ACTUAL (medido el 2026-10-25; no re-investigar)

- `pg_stat_statements`: **la base no es el cuello**. En el minuto pico del PROMPT Y (9 600 peticiones)
  el tiempo de base sumó unos 29 s por cada 60 s. La RPC `obtener_perfil_alumno` es el 35 % del tiempo de
  base (33 ms de media bajo carga, 14 ms en reposo, 1 551 páginas por llamada). Un 25 % es trabajo
  interno de PostgREST (recargas del caché de esquema, `obj_description` del spec).
- Lo que se satura en el plan Nano es la **capa HTTP** (Kong + PostgREST, CPU compartida): manda el
  **número de peticiones** y su **tamaño**.
- Sesión de alumno: ~48 peticiones. Las que se repiten en todas las pantallas: `periodos` (ciclo
  operativo) en 4 de 8 pasos, `periodos_evaluacion` ×2, inscripción → grupo → carrera en 3 consultas
  (boleta, asistencia), portada 4 en cada visita a `/`, justificantes con un sondeo de esquema (2).
- El 80 % de los 42 KB de la RPC del perfil son **los 101 alias de todas las materias**
  (`materias_nombres_visibles`); el alumno usa los de sus ~10.
- Las relaciones existen: `inscripciones_alumno.grupo_id → grupos`, `grupos.carrera_id → carreras`.

## DECISIONES TOMADAS

| # | Cambio | Capa | SQL |
|---|---|---|---|
| Z1 | `resolverIdentidadAlumnoInscripcion` en **una** petición con relaciones incrustadas de PostgREST (misma semántica: 0, 1 o más inscripciones activas; grupo inactivo; carrera opcional) | datos | no |
| Z2 | **Ciclo operativo y sus parciales en caché de 20 s por instancia**, solo en caminos de **lectura** que lo piden explícitamente (`{ cache: true }`): boleta, asistencia del alumno, reportes, `/oceano`. Las escrituras siguen leyendo sin caché. Se invalida en cada escritura de `ciclo-estado.ts` y `evaluaciones.ts` | servidor | no |
| Z3 | **Portada pública en caché de 60 s por instancia**; se invalida en cada escritura de `portada.ts`. El panel de Configuración sigue leyendo sin caché | servidor | no |
| Z4 | **Justificantes del alumno sin sondeo de esquema**: el «esquema pendiente» se deduce del error de la propia lectura | datos | no |
| Z5 | **RPC del perfil v2** (`CREATE OR REPLACE`, misma firma): alias solo de las tablas del alumno (comparados en mayúsculas y sin espacios; los nombres físicos son ASCII), y además `numero_control`, `etiquetas_dinamicas` y `tutor_principal` (sin `password_hash`). La app usa los campos nuevos **si vienen**; si no (SQL sin aplicar), consulta como hoy | datos | **sí: lo aplica la persona** |

**Fuera de este prompt:** la RPC de login (sus reglas —ILIKE con escape, `maybeSingle`— son delicadas para
ahorrar 3 peticiones), el catálogo del docente, C-2 y C-4.

Por qué las cachés no contradicen §16: el costo es de la capa HTTP de datos y la caché **quita
peticiones** de datos de referencia que cambian una vez por semestre (ciclo, parciales, portada), con
caducidad corta e invalidación local. Es el mismo patrón que O3 y O5, no una caché en el frontend.

## MEDICIÓN

`fase11-perfil.mjs --sujetos=3 --runs=3` antes/después y **escalera** con
`fase11-carga.mjs --confirmar-carga --usuarios=100,200,250,300,400,500,600 --rampa=30 --pausa=5000`, con
freno. Si Z5 se aplica, la escalera se repite.

## RESULTADO ESPERADO

Sesión de alumno ~48 → ~30 peticiones sin SQL y ~26 con Z5. En la escalera: 0 fallos hasta 400, p95 de
pocos segundos hasta 500, degradación suave (sin colapso) en 600.

## REGLAS / SEGURIDAD

Ninguna respuesta cambia. Las cachés solo guardan datos públicos o de referencia; nunca datos de un alumno.
Ningún dato personal en la salida de los scripts.

## ALCANCE

SÍ: `lib/escolar/asistencia/asistencias.ts`, `lib/escolar/ciclo/ciclo-estado.ts`,
`lib/escolar/ciclo/evaluaciones.ts`, `lib/escolar/portada/portada.ts`,
`lib/escolar/asistencia/justificaciones.ts`, los llamadores de lectura (boleta, asistencia del alumno,
reportes, `/oceano`), `supabase/crear-rpc-obtener-perfil-alumno.sql`, `app/actions/escolar.ts` (solo
pasar datos ya resueltos) y suites.
NO: escrituras, permisos, RLS, login.

## VALIDACIÓN

`npm run test:ci` · la suite nueva de las cachés · `fase11-perfil` · la escalera.

## INFORME

`docs/historial/informes/INFORME-PROMPT-Z-CAPACIDAD-GRADUAL.md` (7 secciones, ORDEN §6).

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
