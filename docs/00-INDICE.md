# Índice de documentación — qué leer y qué NO leer

Este archivo existe para **ahorrar contexto**. La documentación de este repo pesa
~500 KB; cargarla entera consume la mitad de la ventana de cualquier modelo antes de
escribir una línea. Aquí está qué leer según la tarea, y nada más.

## Peso de cada categoría

| Categoría | Autoridad | Cuándo se lee |
|---|---|---|
| **`normativo/`** | Obliga. Si el código lo contradice, el código está mal. | Siempre que se vaya a modificar algo. |
| **`sistema/`** | Describe el presente, medido sobre el código. | Para localizar dónde vive un problema. |
| **`historial/`** | Describe **un momento pasado**. NO es el estado actual. | Solo para responder «por qué se hizo así». Nunca como fuente de verdad. |

> Regla dura: **nada de `historial/` se cita como estado actual.** Esos documentos
> fueron ciertos el día que se escribieron. Para saber qué es verdad hoy: leer el
> código, o correr un diagnóstico de `scripts/`.

---

## Presupuesto de lectura por tipo de tarea

Leer **solo** la columna de la derecha. Si con eso no alcanza, el índice está mal y
hay que arreglarlo — no cargar todo por si acaso.

| Tarea | Leer |
|---|---|
| **Cualquier cambio** (mínimo obligatorio, ~35 KB) | `AGENTS.md` · `ESTADO-ACTUAL.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/GLOSARIO.md` |
| Crear un archivo, función, script o SQL nuevo | + `docs/normativo/ORDEN.md` (**dónde va cada cosa**) |
| Localizar un bug del que solo se conoce el síntoma | + `docs/sistema/MAPA-DEL-SISTEMA.md` |
| Entender cómo viaja una petición de punta a punta | + `docs/sistema/FLUJO-TECNICO.md` |
| Tocar ciclo escolar / periodos / activación | + `docs/sistema/modulos/CICLO_EVALUACIONES_MODULO.md` |
| Tocar horario semanal o su importación | + `docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md` |
| Escribir un prompt para Cline | + `criterios.prompts` |
| Decidir arquitectura (nuevo módulo, nueva tabla) | + `filosofia.estructural` |
| Ejecutar cualquier script | + `scripts/README.md` (**obligatorio**, hay scripts que borran tablas) |
| Optimizar rendimiento | + `docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md` (1 928 líneas: leer solo la sección que aplique) |
| Auditar un cambio antes de aceptarlo | + `docs/normativo/CONTRATO-DE-CAMBIO.md` |
| Tocar permisos, roles o una Server Action | + `docs/sistema/MATRIZ-PERMISOS.md` |

---

## Mapa de archivos

### Raíz — arranque de agentes
| Archivo | Qué es |
|---|---|
| `AGENTS.md` | Punto de entrada. Orden de autoridad y reglas de trabajo. |
| `CLAUDE.md` | Espejo de `AGENTS.md` para Claude Code. |
| `ESTADO-ACTUAL.md` | **Qué es verdad hoy.** Lo primero que se lee y lo primero que se actualiza. |
| `filosofia.estructural` | NORMATIVO. 16 principios de arquitectura. |
| `criterios.prompts` | NORMATIVO. Cómo se redacta un prompt para Cline. |
| `Name_of_archives_excels_CSVs` | Referencia: nombres literales de las tablas de materia. |
| `contexto.feliz` | HISTORIAL. Bitácora append-only desde mayo. Contiene afirmaciones ya falsas. No es contexto de arranque. |

### `docs/normativo/` — obliga
| Archivo | Qué es |
|---|---|
| `REGLAS_NO_HACER.md` | R1–R8: los errores que ya rompieron el sistema. Prohibiciones permanentes. |
| `GLOSARIO.md` | Los términos donde el sistema ya se rompió por confundirlos. |
| `ORDEN.md` | Dónde va cada cosa: rutas, capas, funciones, scripts, SQL y prompts. Seis órdenes con tabla de decisión. |
| `CONTRATO-DE-CAMBIO.md` | Checklist que todo cambio debe pasar antes de aceptarse. |

### `docs/sistema/` — el presente
| Archivo | Qué es |
|---|---|
| `MAPA-DEL-SISTEMA.md` | **Síntoma → archivos a abrir.** El índice inverso. |
| `MATRIZ-PERMISOS.md` | Matriz de permisos: §3 alcance por rol (5 roles), §4 **implementada** (código ⇄ §4 verificada por `test-permisos`), §5 inventario generado de las 138 Server Actions con su guardia HOY (`exigir: capacidad`), §6 decisiones del PROMPT-2. |
| `FLUJO-TECNICO.md` | Recorrido completo: stack, petición paso a paso, inventario por módulo, deudas. |
| `flujo-tecnico.canvas` | El mismo mapa en visual (Obsidian). |
| `modulos/CICLO_EVALUACIONES_MODULO.md` | Ciclo y parciales. |
| `modulos/HORARIO_SEMANAL_MODULO.md` | Horario semanal. |

### `docs/historial/` — pasado, no citar como presente
| Carpeta | Contenido |
|---|---|
| `auditorias/` | 20 documentos: P0, P1, fases F1–F10, auditorías de ciclo, cierres. |
| `informes/` | Resultado de cada prompt ejecutado (A–D, asistencia, inscripciones). |
| `prompts/` | Los prompts que se le dieron a Cline, tal cual se enviaron. Incluye `PROMPT-1`/`PROMPT-2`/`PROMPT-3`/`PROMPT-4` (ejecutados; informe de cada uno en `informes/`) y `PROMPT-5` (ejecutado en parte: A completa + B1/B2/B6/B7; B3/B4/B5 pendientes, ver su informe). |
| `OPTIMIZACION_RENDIMIENTO_400_500.md` | Benchmark real con 461 alumnos. Las mediciones siguen siendo útiles; las recomendaciones pueden estar aplicadas ya. |

### `scripts/` y `supabase/`
| Ruta | Qué es |
|---|---|
| `scripts/README.md` | Inventario con etiqueta LEE / ESCRIBE / DESTRUCTIVO por script. |
| `scripts/gen-matriz-permisos.mjs` | Mantiene al día el inventario de la matriz de permisos (`npm run gen:matriz`). |
| `scripts/compilar-suites.mjs` | Recompila los módulos puros que consumen las suites (`npm run test:compilar`). Sin esto, `test-*.mjs` falla en un clon limpio. |
| `docs/historial/README.md` | Por qué nada de esa carpeta describe el presente. |
| `scripts/_peligrosos/` | Escriben o borran sin guarda. No ejecutar. |
| `scripts/_archivo/` | Un solo uso, ya consumido. No re-ejecutar. |
| `app/_borrador/` · `lib/_borrador/` | Código escrito, que compila, pero que no usa nadie. Cada uno con su README y su inventario. |
| `supabase/*.sql` | Historial de esquema. Cada archivo es una migración aplicada. No borrar ninguno. |
