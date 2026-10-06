# INFORME — PROMPT S: asistencia por materia, guardado seguro y calendario por materia

> **Reconstruido el 2026-10-06 desde los commits** (`git log --grep="Prompt S"` y
> `git show --stat`). No es el informe que entregó quien implementó, que no se archivó:
> aquí solo está lo que dicen los mensajes y los archivos de cada commit. Las cifras son
> las que declararon el día del commit, no se han vuelto a medir.

## Qué se pidió

`docs/historial/prompts/PROMPT_CLINE_S_ASISTENCIA_POR_MATERIA.md`, medido el 2026-10-01
sobre `d7415a7`, peso 0/14 → Cline. Dos partes con parada obligatoria entre ellas, sin
tablas ni columnas nuevas (la materia ya viaja en la fila: `grupo_materia_id`):

- **Parte A** — que cada subida de asistencia quede atribuida a la materia correcta sin
  posibilidad de error, aunque un profesor suba varias materias del mismo grupo y día.
- **Parte B** — que el calendario muestre las clases de cada día por materia y lo pinte
  verde (todas), naranja (más de la mitad) o rojo (menos de la mitad o ninguna).

## Qué se hizo, por commit

| Commit | Quién (según el commit) | Qué |
|---|---|---|
| `64821c2` · Parte A | sin firma; incluye el prompt | La plantilla lleva una fila reservada MATERIA (nombre visible + `grupo_materia_id`) y el nombre del archivo la clave de la materia; previsualizar y confirmar la exigen («El archivo es de X y elegiste Y»). La materia la sigue decidiendo el servidor: el archivo solo puede impedir la escritura. Previos por materia; una petición UPSERT por tabla con tope `LIMITE_FILAS_SUBIDA=4000`; `periodo_id` obligatorio en las filas nuevas; anular por materia (`elegirFilaParaAnular`, puro). `resolverGrupoMateriaIdSubida` pasa a `asistencia-materia-resolucion.ts` por C9. Suite nueva `test-asistencia-marcador` y un caso de `periodo_id` en `test-atribucion-profesor`. |
| `1397ae8` · revisión A | Claude | Aceptada. Un retoque de orden en `asistencia-plantillas.ts`: la RPC `traspasar_materia_a_profesor` corría antes de la decisión pura, así que una subida rechazada podía cambiar de dueño la materia sin escribir asistencias; ahora va después. |
| `9f171cd` · Parte B y su revisión | Cline (implementación) y Claude (revisión), en un commit | Módulo puro `asistencia-dia-materia.ts` (líneas por materia, legado en «Registro anterior», colores); `obtenerEstadosAsistenciaAlumno` lee `grupo_materia_id` y `profesor_clave` en paralelo con el roster; porcentaje en clases en calendario, resumen por parcial y vista tabular; anular por materia desde el detalle del día; token `--oc-warn`. La revisión: el color sale de `UMBRAL_NARANJA`; una sola regla de conteo (`totalesEnClases`), que estaba copiada en tres sitios y podía pasar del 100 %; las materias pendientes ya no cuentan como falta; los resúmenes cuentan días por color (`diasPorColor`); 8 casos nuevos. |

## Validación declarada

| Commit | Lo que dice |
|---|---|
| `64821c2` | Ninguna (el mensaje no declara validación) |
| `1397ae8` | Comprobado en el código; `test:ci` en verde. No verificado en navegador (exige la sesión de un profesor real contra producción) |
| `9f171cd` | Contra datos reales, en solo lectura: un alumno de 2DO A, 77 días → 66 verdes, 4 rojos, 3 pendientes, 4 sin clase; 94 %; 525 ms. `test:ci` en verde. No verificado en navegador (exige la sesión de un alumno real) |

## Lo pendiente (según los commits)

- Probar la subida (A) y el calendario (B) en el navegador con sesiones reales.
- Entre A y B, anular con dos materias el mismo día respondía «indica la materia»
  (`1397ae8`); B añadió el anular por materia desde el detalle del día.
