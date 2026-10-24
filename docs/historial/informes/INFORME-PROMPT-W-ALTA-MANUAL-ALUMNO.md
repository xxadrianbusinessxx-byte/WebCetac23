# INFORME — PROMPT W (alta manual de alumno)

Fecha: 2026-10-24. Base: `60930b9`. Commit del cambio: `dc95ddc`. Prompt:
`docs/historial/prompts/PROMPT_W_ALTA_MANUAL_ALUMNO.md` (con su retroalimentación al final).

## 1. Qué se hizo

Personas › Alumnos › **Inscripciones** deja de mostrar la carga por archivo y muestra un
formulario de alta manual de UN alumno: CURP, nº de control, nombre, apellido paterno,
apellido materno (opcional), grado y grupo, y la casilla «Crearle perfil de tutor». Con un
envío: fila en `ALUMNOS`, inscripción en `inscripciones_alumno` del ciclo operativo y, si se
marcó, tutor con credenciales iniciales mostradas una vez. Roster conserva la carga masiva.

| Archivo | Capa | Qué |
|---|---|---|
| `lib/escolar/alumno/alta-manual-alumno-puro.ts` | dominio puro | validar y normalizar la entrada, rótulo y orden de grupos, traducción del 23505 |
| `lib/escolar/alumno/alta-manual-alumno.ts` | dominio I/O | contexto (operativo + grupos activos) y alta: compone roster, `inscribirAlumnoEnCiclo` y `crearTutorConAlumnos` |
| `lib/validacion/esquemas-puro.ts` | validación | `esquemaAltaManualAlumno` (forma; el contenido lo decide el módulo puro) |
| `app/actions/alta-alumno.ts` | action | `actionContextoAltaManual`, `actionDarDeAltaAlumnoManual` |
| `app/components/alta-alumno-panel.tsx` | cliente | formulario, revisar → confirmar, resultado |
| `app/components/oceano/contenido-tecnico-oceano.tsx` | cliente | rama `inscripciones` |
| `scripts/test-alta-manual-alumno.mjs` | suite | 37 checks |
| `scripts/diag-alta-manual-alumno.mjs` | diagnóstico `LEE(red)` | conteos antes/después |
| `scripts/README.md` · `docs/sistema/MATRIZ-PERMISOS.md` · `ESTADO-ACTUAL.md` | docs | filas nuevas, matriz regenerada, 52 → 53 suites y una línea en §5b |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Un solo agente (Claude), sin auditor independiente: implementó y se auditó a sí mismo en cada
paso contra el CONTRATO §2. El §5 es una autoevaluación.

| Pudo | No pudo |
|---|---|
| Leer la base por REST (solo GET) y medir | Iniciar sesión como técnico: no hay perfil demo y usar la cuenta real queda fuera |
| Ejercitar el módulo real contra la base por los caminos que se rechazan ANTES de escribir | Hacer un alta real: la base es producción y el prompt lo prohibía |
| Ver el panel dibujado en una ruta temporal, en escritorio y móvil | Ver el panel dentro de `/oceano` con grupos cargados |

## 3. Cómo se ejecutó y se midió

| Medición | Antes | Después |
|---|---|---|
| `diag-alta-manual-alumno.mjs`: ALUMNOS · con nº de control · inscripciones activas · relaciones tutor · periodo · grupos | 472 · 1 · 357 · 458 · `2026-2027` · 24 | idéntico |
| Suites (`correr-todas-las-suites`) | 52 | 53 (nueva: 37 ok · 0 fallos) |
| `npm run test:ci` | — | EXIT=0 (dos veces; la segunda tras el último cambio de UI) |
| `test-orden` | EXIT=0 | EXIT=0 (C10 sin subir: la suite y el diag tienen fila) |

Prueba del módulo real contra la base, sin escribir (`node --conditions=react-server`):
contexto → `2026-2027`, 24 grupos rotulados con carrera (MECATRONICA / RH); grupo ajeno →
rechazo; CURP existente → rechazo con el nombre; nº de control repetido → rechazo. En la
pantalla, sin sesión, la action responde «No tienes permiso» y el selector dice «Sin grupos
disponibles»; sin errores de consola y sin scroll horizontal a 375 px.

## 4. Normas respetadas (CONTRATO §2)

| Punto | Cumple | Cómo |
|---|---|---|
| Solo lo pedido; sin borrar legacy (R8); sin paralelos (R6) | Sí | reutiliza las tres escrituras, `pareceCurp` y `validarNumeroControl` |
| Lógica en `lib/`, puro separado del I/O, la UI no decide | Sí | la UI llama la misma función pura que el servidor solo para avisar antes |
| Aditivo, sin SQL ni migración | Sí | ningún `.sql`; ningún dato escrito |
| Previsualizar → confirmar | Sí | Revisar → Confirmar alta (no estaba en el prompt; añadido) |
| Ciclo por `periodos.id`; alumno→grupo por `inscripciones_alumno` | Sí | el servidor resuelve el periodo; `inscribirAlumnoEnCiclo` |
| `test:ci` verde; medición antes/después; nada de `_peligrosos/` | Sí | ver §3 |
| `gen:matriz`, ESTADO-ACTUAL, informe | Sí | ver tabla de §1 |

## 5. ¿Sigue la filosofía y la arquitectura? (autoevaluación)

| Principio | Veredicto |
|---|---|
| Autorizar → validar → delegar | Respeta: `exigir` → `leerEntrada` → `validarAltaManualAlumno` → `lib/`; sin `.from()` en la action |
| Una fuente de verdad | Respeta: periodo del servidor, inscripción por la función única, tutor por la misma función que «Generar automáticos» |
| `lib/auth/` intacto | Respeta: `alumno.cargar_roster` cubre el alta; `tutor.crear` se comprueba con `puede()` |
| Fallar en voz alta, nada destructivo | Respeta: éxito parcial explícito; no se borra el alumno si falla la inscripción o el tutor |

Veredicto: **respeta**.

## 6. Desviaciones y decisiones propias

1. CURP con el formato estricto existente en vez del flojo que pedía el prompt (retro §1).
2. Paso de revisión en la UI (retro §2).
3. Un solo commit de código: el prompt tenía una sola parte.
4. El técnico captura el nº de control en el alta sin tener `alumno.editar_numero_control`:
   decidido en el prompt (decisión 1); corregirlo sigue siendo de Administración escolar.
5. Corrección UX hallada al verificar: el selector decía «Cargando grupos…» para siempre si el
   contexto fallaba.

## 7. Lo no verificado / pendiente

- **Un alta real con sesión de técnico**, con y sin tutor: insertar, inscribir y crear tutor
  solo se comprobaron leyendo el código y el esquema REST (`ALUMNOS` solo exige `CURP`).
- Que en `/oceano` el modo Inscripciones monte el panel: comprobado por código y build, no en
  pantalla con sesión.
- El CI de GitHub: sin push.
