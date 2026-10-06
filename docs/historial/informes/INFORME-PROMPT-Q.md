# INFORME — PROMPT Q: desbloquear el CI, sacar la decisión pura y poner los documentos al día

> **Reconstruido el 2026-10-06 desde los commits** (`git log --grep="Prompt Q"` y
> `git show --stat`). No es el informe que entregó quien implementó, que no se archivó:
> aquí solo está lo que dicen los mensajes y los archivos de cada commit. Las cifras son
> las que declararon el día del commit, no se han vuelto a medir.

## Qué se pidió

`docs/historial/prompts/PROMPT_CLINE_Q_ESTADO_MODULARIDAD_DOCS.md`, medido el 2026-09-30
sobre `fa41157`, peso 3/14 → Cline. Sustituye al PROMPT P, que no se ejecutó. Tres partes
con parada obligatoria entre cada una:

- **Parte 0** — desbloquear el CI (`verificar:estado` en rojo: ESTADO-ACTUAL declaraba un
  HEAD 18 commits atrás, con un máximo de 10).
- **Parte 1** — sacar la decisión pura de cuatro módulos con I/O.
- **Parte 2** — renovación de documentos: qué se limpia, qué se archiva, qué se mantiene.

Fuera, con su porqué escrito en el prompt: `archivos_calificaciones` (un módulo que
apunta a una tabla que nunca existió: decide el responsable), los round-trips de
`app/actions/administracion.ts`, C16, re-medir rendimiento y los 31 de 35 componentes
sin manejo de error.

## Qué se hizo, por commit

| Commit | Quién (según el commit) | Qué |
|---|---|---|
| `6b31e6b` | Claude | Archiva el prompt (288 líneas) y explica por qué `archivos_calificaciones` no entra. |
| `7fdb83b` · Parte 0 | Cline (DeepSeek), con Claude | `ESTADO-ACTUAL.md` al día (cabecera en `6b31e6b`; el sexto rol es el único que acepta constancias; portada pública; nueve familias en `lib/escolar`; 22 cuentas en PROFESORES, vuelto a medir con `diag-credenciales-duplicadas`; C14 y C15 en la lista de reglas). `RUMBO.md` regenerado: el CI estaba rojo también por `gen-rumbo --check`. El nombre muerto `gen-contexto-cline.mjs` → `gen-contexto.mjs` en `scripts/diag-peso-cambio.mjs` (regex de GOBIERNO y sugerencia), en el prompt y en `SOSTENIBILIDAD-DEL-REPARTO.md`. El puntero de ESTADO §2 pasa de la BITACORA a `INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` §T4. |
| `c2a285c` · Parte 1 | Cline (DeepSeek), con Claude | Cuatro `-puro` nuevos (`horario-semanal`, `evaluaciones`, `horario-importar-validacion`, `justificaciones`); los originales los re-exportan y conservan su I/O, así que ningún import cambió. Cuatro suites nuevas (133 verificaciones: 55 · 34 · 20 · 24). `grupoLegibleTexto` queda exportado en el `-puro` (desviación declarada). Dos hallazgos fijados como aserción y no arreglados: `materiaTieneClaseEnDia` compara la clave sin normalizar y `rutaStorageJustificacion` usa el nombre entero como extensión si no tiene punto. |
| `632a996` · Parte 2 | Cline (DeepSeek), con Claude | `docs/sistema/MATRIZ-UX.md` §§2, 3, 5 y 6 contra la UI que existe (árbol desde `shell-oceano`, tabla de rutas como legado). `pendientes.json`: «15 de 22 profesores» y cerrado `matriz-ux-anterior-al-shell`; `RUMBO.md` regenerado. Nuevo `docs/historial/auditorias/README.md` (tres capas, no una serie); Claude corrigió en él que la rama `feature/ciclo-f1-f7-sin-push` **sí** está fusionada. |

## Validación declarada

| Parte | Lo que dice el commit |
|---|---|
| 0 | tsc 0 · `test:ci` 0 · 41/41 suites · permisos 709 · `gen:matriz` 0 · test-orden 15 reglas · `verificar:estado` 0 (era 1) · `gen-rumbo --check` 0 (era 1) · `verificar:docs` 0 con 0 rutas muertas · lint 0 · build 9 rutas. ESTADO-ACTUAL en 145 de 150 líneas |
| 1 | tsc 0 · 45/45 suites · permisos 709 y 180 actions con 284 pasadas · `gen:matriz` 0 · test-orden 15 reglas con C5 en 0 · `verificar:estado` 0 · `verificar:docs` 0 · lint 0 errores · build 9 rutas. Las cuatro suites nuevas salen con 1 ante un fallo; `node --experimental-strip-types` carga `horario-semanal-puro.ts` sin base |
| 2 | tsc 0 · 45/45 suites · test-orden 15 reglas · `verificar:estado` 0 · `gen-rumbo --check` 0 · `verificar:docs` 0 · lint 0 errores · build 9 rutas. Pendientes: 14 abiertos, 3 cerrados. Arranque: 10 337 de 10 500 tokens, sin recortar |

## Lo pendiente (según los commits)

- `archivos_calificaciones`: crear la tabla o retirar el módulo. Lo decide el responsable.
- `lib/supabase/database.types.ts` sigue sin generarse: el demonio de Docker no corría y
  la CLI de supabase no estaba en el PATH (`632a996`).
- Los dos hallazgos de la Parte 1, fijados como aserción.
- El techo del arranque («sin decidir si se sube o se poda»). Lo decidió después la
  DECISIÓN 1 del Prompt V: se mantiene en 10 500 y se poda.
- Lo que el prompt dejó fuera. C16 lo hizo después el Prompt R, Parte 0 (`3dfb005`).
