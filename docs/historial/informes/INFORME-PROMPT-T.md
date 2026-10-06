# INFORME — PROMPT T: reportes en Notificaciones del alumno · agenda de citas del directivo

> **Reconstruido el 2026-10-06 desde los commits** (`git log --grep="Prompt T"` y
> `git show --stat`). No es el informe que entregó quien implementó, que no se archivó:
> aquí solo está lo que dicen los mensajes y los archivos de cada commit. Las cifras son
> las que declararon el día del commit, no se han vuelto a medir.

## Qué se pidió

`docs/historial/prompts/PROMPT_T_REPORTES_Y_AGENDA_CITAS.md`: diagnóstico de Claude del
2026-10-01 sobre `d7b2803`. Dos partes independientes, en commits separados:

- **Parte A** — que los reportes disciplinarios lleguen a Notificaciones del alumno.
- **Parte B** — «Configurar citas»: el directivo define cuándo recibe citas, y alumno y
  tutor solo piden dentro de esa agenda.

No lo ejecutó Cline: lo ejecutó Claude a pedido del responsable. El prompt archivado lleva
al final «EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-01)», con lo que la auditoría corrigió del
propio prompt (vocabulario de días, reutilizar helpers, la agenda dentro de
`administracion-panel.tsx`, `vistaCitas()`, la lógica en `lib/` y el diag nuevo).

## Qué se hizo, por commit

| Commit | Qué |
|---|---|
| `95157b0` · Parte A | Capacidad nueva `reporte.ver_propios` (alumno, tutor, administración), con alcance por `resolverAccesoAlumno`. I/O `listarReportesVisiblesDeAlumno`: solo los no anulados, sin `creado_por`, y un error de lectura se propaga. `hora-plantel-puro.ts`: la fecha local del plantel (America/Mexico_City, −06:00). `notificaciones-alumno` gana una tercera fuente opcional con `gravedad`; cada fuente falla por separado. |
| `1ca2310` · Parte B | `supabase/crear-agenda-citas.sql` (aditivo, idempotente, sin ejecutar): `citas_franjas`, `citas_dias_bloqueados` e índice único parcial `ux_citas_hueco_vivo`. Puro `agenda-citas-puro.ts` (`validarSolicitudCita`; `huecosDisponibles` filtra con ella) e I/O `agenda-citas.ts` (`pedirCitaEnAgenda`; `23505` → «Ese horario ya está ocupado»). Actions con `cita.gestionar` y `cita.solicitar`, sin capacidades nuevas. «Configurar citas» dentro de `administracion-panel.tsx` (C11 sigue en 21); Sesiones programadas con huecos reales. `solicitarCita` queda `@deprecated`. `scripts/diag-agenda-citas.mjs`, pendiente `sql-agenda-citas` y RUMBO regenerado. Archiva el prompt. |

## Validación declarada

| Parte | Lo que dice el commit |
|---|---|
| A | Medido en solo lectura: 1 reporte en la base, anulado → 0 visibles. `test-rediseno-oceano` 463/463 (+24), `test-permisos` 737 (+8), auditoría de permisos 299. `test:ci` en verde. No verificado en navegador (exige sesión real de alumno o tutor) |
| B | Medido en solo lectura, antes = después: tablas sin crear, 1 cita (rechazada), 0 vivas → el índice único se puede crear sin conflicto. `test-uis-pendientes` 151 (+50), `test-validacion` 82 (+13), `test-rediseno-oceano` 469 (+6), auditoría de permisos 305. `test:ci` en verde. No verificado en navegador (exige sesión real y el SQL ejecutado) |

## Lo pendiente (según los commits)

- El SQL de la agenda: `d9055e0`, posterior, lo da por ejecutado el 2026-10-01 y
  confirmado con `diag-agenda-citas.mjs`. Falta lo operativo: con 0 franjas nadie puede
  pedir cita, así que el directivo tiene que publicar al menos un horario.
- Probar las dos partes en el navegador con sesiones reales.
