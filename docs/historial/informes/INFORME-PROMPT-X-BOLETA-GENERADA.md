# INFORME — PROMPT X (boleta generada, activada por parcial)

Fecha: 2026-10-24. Base: `7ac451d`. Commits: `e56482e` (Parte A), `e899f3a` (Parte B) y el
del cierre (este informe, el prompt archivado y el pendiente del SQL). Prompt:
`docs/historial/prompts/PROMPT_X_BOLETA_GENERADA.md` (con su retroalimentación al final).

## 1. Qué se hizo

La subida manual de boletas desaparece. El directivo **activa** la boleta de un parcial
(`periodos_evaluacion`) para todo el plantel, un grado o un grupo, y la desactiva a mano. El
alumno y su tutor la ven en **Perfil › Boleta** (antes «Estatus académico») solo mientras haya
una activación que los cubra; Administración escolar, en **Alumnos › Boleta**; el directivo
consulta la de cualquier alumno (grupo → alumno). La boleta **no se guarda**: se arma al leer
con la nota `promedio` que cada profesor tiene subida en ese momento, su asistencia del parcial
y los datos del plantel. Carta horizontal, logo SEP arriba a la izquierda, solo pantalla, con
zoom.

| Parte | Archivo | Capa | Qué |
|---|---|---|---|
| A | `supabase/crear-boletas-activacion.sql` | esquema | tabla `boletas_activacion` (CHECK de alcance, una vigente por alcance, desactivar no borra) y RPC `activar_boleta` |
| A | `lib/auth/capacidades.ts` · `permisos.ts` · `MATRIZ-PERMISOS.md` §4 · `test-permisos.mjs` | auth | `boleta.activar`, solo directivo |
| A | `lib/escolar/tables.ts` · `materia/tablas-sistema.ts` | dominio | `TABLA_BOLETAS_ACTIVACION`, clasificada (C15) |
| A | `scripts/diag-boletas.mjs` | diagnóstico `LEE(red)` | parciales, activaciones, materias con promedio, alumnos sin nº de control |
| B | `lib/escolar/administracion/boleta-puro.ts` | dominio puro | calificación mostrada, promedio general, asistencia, duración, alcance por modo, activación que aplica, parcial del personal, `validarActivacion`, `armarBoleta` |
| B | `lib/escolar/administracion/boleta.ts` | dominio I/O | compone lo existente; activar (RPC), desactivar, alumnos de un grupo; tolera el SQL sin aplicar |
| B | `lib/escolar/materia/calificaciones.ts` | dominio I/O | `promediosDeAlumno`: una consulta |
| B | `lib/validacion/esquemas-puro.ts` | validación | cuatro esquemas de forma |
| B | `app/actions/boletas.ts` | action | ver (`calificacion.ver` + `resolverAccesoAlumno`), activar/desactivar/listar (`boleta.activar`) |
| B | `app/components/boleta-vista.tsx` · `boletas-activacion-panel.tsx` · `ui/visor-con-zoom.tsx` | cliente | la hoja, el panel del alumno, el del directivo (revisar → confirmar), el visor |
| B | `lib/navegacion/*` · `contenido-*-oceano.tsx` | navegación | `perfil/boleta`, `expediente/boleta`, `boletas-directivo` y sus dos modos |
| B | `scripts/test-boleta.mjs` · `test-rediseno-oceano.mjs` | suites | 92 casos nuevos; 13 comprobaciones de navegación |
| B | `ESTADO-ACTUAL.md` · `MAPA-DEL-SISTEMA.md` · `scripts/README.md` · `pendientes.json` | docs | fuente única nueva, 53 → 54 suites, síntoma «no ve su boleta», filas, pendiente del SQL |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Un solo agente (Claude): redactó el prompt, lo implementó a petición del usuario («ejecuta tú
todo») y se auditó a sí mismo contra el CONTRATO §2. Sin auditor independiente: el §5 es una
autoevaluación. La medición de peso (`diag-peso-cambio`, 9/14) asignaba la Parte A a Claude y la
B a Cline; las dos las hizo Claude.

| Pudo | No pudo |
|---|---|
| Leer la base (REST y SQL de solo lectura) y medir antes y después | **Aplicar el SQL**: el clasificador de seguridad bloqueó `execute_sql`. Queda como pendiente de persona |
| Ejecutar el armado REAL (`boletaDeAlumno`, `contextoActivacionBoletas`, `alumnosDeGrupoParaBoleta`) contra la base, sin escribir | Activar o desactivar de verdad: sin la tabla no hay dónde, y la base es producción |
| Ver la hoja real (`HojaBoleta` transpilado y renderizado a HTML) en el navegador | Iniciar sesión en `/oceano` como directivo, alumno o tutor: solo hay cuentas reales |

## 3. Cómo se ejecutó y se midió

| Medición | Antes | Después |
|---|---|---|
| `diag-boletas.mjs`: periodo · parciales · tabla · materias con promedio · filas · sin nº de control | `2026-2027` · 3 · no existe · 1 · 41 · 471 de 472 | idéntico (el SQL sigue sin aplicar) |
| Suites | 53 | 54 en verde (`test-boleta`: 92/0) |
| `test-permisos` | 738 | 748/0 (las dos aserciones nuevas, la fila nueva de §4 y el inventario de las actions nuevas) |
| Server Actions auditadas | 203 | 208 |
| `npm run test:ci` | EXIT=1 por `RUMBO.md` desfasado de antes (11 commits) | EXIT=0 tras regenerarlo, tres veces (A, B y tras la auditoría) |
| `test-orden` | EXIT=0 | EXIT=0 (C10 subió a 20 a mitad y volvió a 19 con la fila de la suite) |

Prueba del armado real (solo lectura, `node --conditions=react-server`): contexto → `2026-2027`,
3 parciales, 24 grupos, grados 1RO–6TO, `esquema: false`; un alumno de 5TO A con notas →
11 materias (Inglés V = 8, el resto «Sin calificar»), promedio general 8, Parcial 2 por defecto
(hoy cae en él), «Sin registro» de asistencia en P2 y 25 % en P1, 1.2 s; la misma CURP en modo
familia → «La boleta de este parcial aún no está disponible»; un parcial falso al activar →
rechazado por `validarActivacion` antes de llamar a la RPC.

## 4. Normas respetadas (CONTRATO §2)

| Punto | Cumple | Cómo |
|---|---|---|
| Solo lo pedido; R8; R6 | Sí, con una desviación anotada | se quedan la pieza del registro legacy, `actionObtenerVistaRegistro` y «Grupo»; se reutilizan inscripción, parciales, materias, asistencia y constancia |
| Lógica en `lib/`; puro separado; la UI no decide | Sí | la action solo autoriza, valida y delega; `puedeElegirParcial` llega del servidor |
| Aditivo; `.sql` versionado | Sí | tabla y función nuevas, `IF NOT EXISTS` / `OR REPLACE`; ningún dato escrito |
| Previsualizar → confirmar | Sí | Activar → Confirmar activación; Desactivar → Sí, desactivar (añadido en la auditoría) |
| Identidades | Sí | `periodos.id`, `periodos_evaluacion.id`, `grupos.id`, `PROFESORES.ID`, `grupo_materia_id`, `inscripciones_alumno` |
| Clasificar la tabla nueva (C15) | Sí | `tables.ts` + `tablas-sistema.ts` |
| `test:ci`, medición antes/después, nada de `_peligrosos/` | Sí | ver §3 |
| `gen:matriz`, ESTADO-ACTUAL, MAPA, pendientes + `gen-rumbo` | Sí | en el mismo cambio |

## 5. ¿Sigue la filosofía y la arquitectura? (autoevaluación)

| Principio | Veredicto |
|---|---|
| Autorizar → validar → delegar | Respeta: `exigir` → `leerEntrada` → `lib/`; sin `.from()` en la action |
| Una fuente de verdad | Respeta: «sobre quién» lo decide `resolverAccesoAlumno`; la boleta no crea una segunda copia de las notas: las lee |
| Lo exclusivo va en PL/pgSQL | Respeta: «una vigente por alcance» la imponen el índice único parcial y `activar_boleta` |
| Lista blanca de alcance | Respeta: `alcanceVistaBoleta` deja fuera al maestro y a cualquier modo nuevo |
| Fallar en voz alta | Respeta: «Sin calificar», «Revisar», «Sin asignar», «Sin registro» en vez de huecos; el SQL pendiente se dice en pantalla |
| Assets al tamaño en que se ven (R-UX3) | Respeta: `SEPLogo.png` (10.6 KB) en vez de `SepConstanciaLogo.png` (110 KB) |

Veredicto: **respeta**.

## 6. Desviaciones y decisiones propias

1. **«Alumnos › Estatus académico» de Administración escolar se retiró.** El prompt decía «no se
   toca»; `test-rediseno-oceano` lo rechazó: el expediente enseña lo que ve el alumno, y el
   alumno ya no lo tiene. Queda «Boleta».
2. **Revisar → confirmar al activar**: el prompt no lo pedía; lo exige el CONTRATO §2.
3. **La familia no ve errores técnicos**: sin ciclo operativo o con la inscripción rota ve «aún no
   está disponible»; el personal sí ve el motivo.
4. **`boletaDeAlumno(…, { alcance })`** en vez de `datosBoletaDeAlumno(…, { exigirActivacion })`:
   el alcance sale del modo que ya resolvió `resolverAccesoAlumno`.
5. **Hallazgos de la auditoría**: una fecha ilegible daba «31/12/1969»; dos materias con el mismo
   nombre repetían la clave de fila; el selector de parcial desaparecía mientras cargaba; el visor
   cambiaba de tope entre el 100 % y el 125 %. Los cuatro se corrigieron.
6. `RUMBO.md` estaba 11 commits atrás antes de empezar y tumbaba `test:ci`: se regeneró.
7. La descripción de `calificacion.ver` en la matriz decía «6 actions» y eran 8; ahora 9.

## 7. Lo no verificado / pendiente

- **El SQL sin aplicar** (`sql-boletas-activacion` en `pendientes.json`). Hasta entonces la
  activación avisa y no deja guardar, y alumno y tutor ven «aún no está disponible».
- **Una activación real con sesión**: activar un grupo, entrar como alumno y como tutor de ese
  grupo, desactivar. Lo de alumno y tutor solo se comprobó en el módulo y con la CURP en modo
  familia.
- Los dos paneles dentro de `/oceano`: comprobados por tipos, lint, build y suites; la hoja, en
  HTML renderizado del componente real.
- Que la RPC funcione tal cual en Postgres: no se pudo ejecutar.
- Retirar la pieza `perfil-registro-calificaciones` y su componente (ya sin hueco), y la lectura
  de `registro` que `/oceano` sigue haciendo para el alumno: aparte (R8).
- Los manuales de AulaNube (`things/`) siguen describiendo la subida manual.
- El CI de GitHub: sin push.
