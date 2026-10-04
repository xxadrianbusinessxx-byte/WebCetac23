# Índice de documentación — qué leer y qué NO leer

Este archivo existe para **ahorrar contexto**. La mayor parte de la documentación es
historial; cargarla entera agota la ventana de cualquier modelo antes de escribir una
línea. Aquí está qué leer según la tarea, y nada más.

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
| **Cualquier cambio** (mínimo obligatorio; coste: `npm run verificar:docs`) | `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` · `docs/normativo/GLOSARIO.md` |
| Crear un archivo, función, script o SQL nuevo | + `docs/normativo/ORDEN.md` (**dónde va cada cosa**) · SQL: `filosofia.estructural` §9-§10 |
| Localizar un bug del que solo se conoce el síntoma | + `docs/sistema/MAPA-DEL-SISTEMA.md` |
| Entender cómo viaja una petición de punta a punta | + `docs/sistema/FLUJO-TECNICO.md` |
| Tocar ciclo escolar / periodos / activación | + `docs/sistema/modulos/CICLO_EVALUACIONES_MODULO.md` |
| Tocar horario semanal o su importación | + `docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md` |
| Escribir un prompt para Cline | + `criterios.prompts` |
| Decidir arquitectura o quién implementa (nuevo módulo, nueva tabla, decisión humana) | + `filosofia.estructural` §1-§3 · `scripts/diag-peso-cambio.mjs` · `AGENTS.md` §Qué nunca se delega |
| Ejecutar cualquier script | + `scripts/README.md` (**obligatorio**, hay scripts que borran tablas) |
| Optimizar rendimiento | + pendiente `remedir-rendimiento` (`docs/sistema/pendientes.json`) · `filosofia.estructural` §11 y §16 · línea base histórica (la consulta Claude): `docs/historial/OPTIMIZACION_RENDIMIENTO_400_500.md` |
| Auditar un cambio antes de aceptarlo | + `docs/normativo/CONTRATO-DE-CAMBIO.md` · `docs/normativo/ORDEN.md` («La prueba del algodón» y «Cómo se rompe este orden») |
| Tocar permisos, roles o una Server Action | + `docs/sistema/MATRIZ-PERMISOS.md` (§3 y la entrada de §5 del archivo) |
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
| `MATRIZ-PERMISOS.md` | Matriz de permisos: §3 alcance por rol, §4 **implementada** (código ⇄ §4 verificada por `test-permisos`), §5 inventario generado de las Server Actions con su guardia HOY (`exigir: capacidad`), §6 decisiones del PROMPT-2. |
| `MATRIZ-UX.md` | **Matriz de UX.** Dónde vive cada decisión visual: §2 capas, §3 mapa de rutas y zonas, §4 tokens medidos (color, glass, radios, sombras, tipografía, movimiento), §5 catálogo de piezas y sus recetas, §6 «quiero cambiar X → toco Y», §7 deuda medida + plan de consolidación, §8 invariantes, §10 bitácora. Se actualiza en el mismo cambio que lo vuelve falso. |
| `FLUJO-TECNICO.md` | Recorrido completo: stack, petición paso a paso, inventario por módulo, deudas. |
| `flujo-tecnico.canvas` | El mismo mapa en visual (Obsidian). |
| `modulos/CICLO_EVALUACIONES_MODULO.md` | Ciclo y parciales. |
| `modulos/HORARIO_SEMANAL_MODULO.md` | Horario semanal. |
| `pendientes.json` | Fuente única de pendientes; la leen gen-rumbo, gen-estado y gen-contexto. |
| `TOKENS-OCEANO.css` | Tokens; `app/globals.css` copia su bloque literal. |

### `docs/historial/` — pasado, no citar como presente
Lo que contiene cada subcarpeta lo dice `docs/historial/README.md`. Las mediciones de
rendimiento (FASES 9/10) son anteriores al refactor: no describen el presente.

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
| `supabase/*.sql` | Esquema escrito; **escrito ≠ aplicado**: lo que falta ejecutar o verificar son los pendientes abiertos de `docs/sistema/pendientes.json` cuyo `doc` es un `.sql`. No borrar ninguno. |
