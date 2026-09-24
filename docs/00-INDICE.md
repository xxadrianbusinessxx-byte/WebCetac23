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
| **`informes/`** | **Ninguna.** Generado por `npm run informe`, se regenera entero. | Para una persona que quiere ver de dónde viene el repo sin abrirlo. Nunca se cita como norma ni como estado. |

> Regla dura: **nada de `historial/` se cita como estado actual.** Esos documentos
> fueron ciertos el día que se escribieron. Para saber qué es verdad hoy: leer el
> código, o correr un diagnóstico de `scripts/`.

---

## Presupuesto de lectura por tipo de tarea

Leer **solo** la columna de la derecha. Si con eso no alcanza, el índice está mal y
hay que arreglarlo — no cargar todo por si acaso.

| Tarea | Leer |
|---|---|
| **Cualquier cambio** (mínimo obligatorio, ~37 KB) | `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` · `docs/normativo/GLOSARIO.md` |
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
| Cambiar apariencia: color, forma, tipografía, o dónde va una zona de la UI | + `docs/sistema/MATRIZ-UX.md` (**§6 dice qué archivo tocar y a qué afecta**) |

---

## Mapa de archivos

### Raíz — arranque de agentes
| Archivo | Qué es |
|---|---|
| `AGENTS.md` | Punto de entrada. Orden de autoridad y reglas de trabajo. |
| `CLAUDE.md` | Puntero a `AGENTS.md`, nada más. No repite ninguna regla: duplicarla es R6. |
| `ESTADO-ACTUAL.md` | **Qué es verdad hoy.** Lo primero que se lee y lo primero que se actualiza. |
| `RUMBO.md` | **En medio de qué estamos.** Campaña, cierre y fuera de alcance. |
| `filosofia.estructural` | NORMATIVO. 16 principios de arquitectura. |
| `criterios.prompts` | NORMATIVO. Cómo se redacta un prompt para Cline. |
| `Name_of_archives_excels_CSVs` | Referencia: nombres literales de las tablas de materia. |

### `docs/normativo/` — obliga
| Archivo | Qué es |
|---|---|
| `REGLAS_NO_HACER.md` | R1–R8: los errores que ya rompieron el sistema. Prohibiciones permanentes. |
| `INVARIANTES.md` | Los 16 principios, uno por línea. Generado desde el ensayo. |
| `GLOSARIO.md` | Los términos donde el sistema ya se rompió por confundirlos. |
| `ORDEN.md` | Dónde va cada cosa: rutas, capas, funciones, scripts, SQL y prompts. Seis órdenes con tabla de decisión. |
| `CONTRATO-DE-CAMBIO.md` | Checklist que todo cambio debe pasar antes de aceptarse. |

### `docs/sistema/` — el presente
| Archivo | Qué es |
|---|---|
| `MAPA-DEL-SISTEMA.md` | **Síntoma → archivos a abrir.** El índice inverso. |
| `MATRIZ-PERMISOS.md` | Matriz de permisos: §3 alcance por rol (6 roles), §4 **implementada** (código ⇄ §4 verificada por `test-permisos`), §5 inventario generado de las 138 Server Actions con su guardia HOY (`exigir: capacidad`), §6 decisiones del PROMPT-2. |
| `MATRIZ-UX.md` | **Matriz de UX.** Dónde vive cada decisión visual: §2 capas, §3 mapa de rutas y zonas, §4 tokens medidos (color, glass, radios, sombras, tipografía, movimiento), §5 catálogo de piezas y sus recetas, §6 «quiero cambiar X → toco Y», §7 deuda medida + plan de consolidación, §8 invariantes, §10 bitácora. Se actualiza en el mismo cambio que lo vuelve falso. |
| `FLUJO-TECNICO.md` | Recorrido completo: stack, petición paso a paso, inventario por módulo, deudas. |
| `flujo-tecnico.canvas` | El mismo mapa en visual (Obsidian). |
| `modulos/CICLO_EVALUACIONES_MODULO.md` | Ciclo y parciales. |
| `modulos/HORARIO_SEMANAL_MODULO.md` | Horario semanal. |

### `docs/historial/` — pasado, no citar como presente
| Ruta | Contenido |
|---|---|
| `auditorias/` | 20 documentos: P0, P1, fases F1–F10, auditorías de ciclo, cierres. |
| `informes/` | Resultado de cada prompt ejecutado (A–D, asistencia, inscripciones). |
| `prompts/` | Los prompts que se le dieron a Cline, tal cual se enviaron. Incluye `PROMPT-1`/`PROMPT-2`/`PROMPT-3`/`PROMPT-4` (ejecutados; informe de cada uno en `informes/`) y `PROMPT-5` (ejecutado en parte: A completa + B1/B2/B6/B7; B3/B4/B5 pendientes, ver su informe). |
| `contexto.feliz.md` | Bitácora append-only desde mayo. Contiene afirmaciones ya falsas. **No es contexto de arranque**: se conserva para responder «por qué se hizo así». |
| `OPTIMIZACION_RENDIMIENTO_400_500.md` | Benchmark real con 461 alumnos. Las mediciones siguen siendo útiles; las recomendaciones pueden estar aplicadas ya. |

### `scripts/` y `supabase/`
| Ruta | Qué es |
|---|---|
| `scripts/README.md` | Inventario con etiqueta LEE / ESCRIBE / DESTRUCTIVO por script. |
| `scripts/gen-matriz-permisos.mjs` | Mantiene al día el inventario de la matriz de permisos (`npm run gen:matriz`). |
| `scripts/gen-contexto.mjs` | Arma el contexto acotado de un trabajo desde este índice y el resto de fuentes. `--agente=cline` (por defecto) da el paquete de instrucciones; `--agente=claude`, el brief de diagnóstico. **Se genera, no se escribe a mano** (`AGENTS.md` §Reparto). |
| `scripts/verificar-docs.mjs` | Vigila que ESTE sistema de documentos siga sano: rutas vivas en los documentos del presente y techo de tokens del arranque (`npm run verificar:docs`). Está en el CI. |
| `docs/historial/README.md` | Por qué nada de esa carpeta describe el presente. |
| `scripts/_peligrosos/` | Escriben o borran sin guarda. No ejecutar. |
| `scripts/_archivo/` | Un solo uso, ya consumido. No re-ejecutar. |
| `scripts/_archivo/borrador/` | La cuarentena `_borrador/` (app y lib), resuelta archivo por archivo en el PROMPT F. Su README dice qué es cada cosa y de dónde vino. |
| `supabase/*.sql` | Historial de esquema. Cada archivo es una migración aplicada. No borrar ninguno. |
