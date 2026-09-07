# INFORME — PROMPT-4: Configurador de ciclo (actualizar y deshacer)

- **Fecha de ejecución:** 2026-09-06
- **Prompt:** `docs/historial/prompts/PROMPT-4-CONFIGURADOR-CICLO.md`
- **Estado:** ejecutado T1–T5.
- **Punto de parada T1:** se eligió la **opción A** (marcar la decisión, no el
  estado), la recomendada por el propio prompt, con autorización del directivo.

---

## 1. Medición previa (§3 del prompt) — pegada

```
Ciclo operativo: 2026-2027 (7cf5cca7-f448-4f03-a624-8d34fba00aaf), único
Inscripciones activas: 357 · CURPs con más de una ACTIVA: 0
CURPs con más de una FILA en el operativo: 92
  de esos, la fila MÁS RECIENTE está hoy INACTIVA (invertiría al reactivar): 57
Roles / capacidades / actions: 5 / 62 / 138
Aliases: materias_nombres_visibles tiene columna activo
```

El 57/92 se replicó con un diag propio
(`scripts/diag-inscripciones-reactivacion.mjs`) que reproduce exactamente el
orden de `sincronizarInscripcionesOperativo` (created_at desc, id desc).

## 2. Medición posterior (contrato §6.5)

```
node scripts/test-permisos.mjs             → 475 pasadas, 0 fallidas (5 roles, código ⇄ §4)
node scripts/test-auditoria-permisos.mjs   → 146 actions, 229 pasadas, 0 fallidas
node scripts/gen-matriz-permisos.mjs --check → "Al día."
npx tsc --noEmit                           → 0 errores
Las 34 suites                              → 0 fallos
next build                                 → 9 rutas

Riesgo de inversión al reactivar el ciclo: 57 → 0
Filas marcadas decision_manual=true:       58 (57 CURPs + 1 en cascada)
Roles: 5 · capacidades 64 · actions 146
```

## 3. Qué se hizo y por qué

### T1 · La decisión humana sobrevive a la activación (bloqueante)

El defecto era de semántica: `inscripciones_alumno.activo` significaba «pertenece
al ciclo operativo», y la deduplicación del PROMPT-1/T3 había usado el roster
como verdad (desactivando filas) mientras que `sincronizarInscripcionesOperativo`
usa la fecha (`created_at`) como verdad al reactivar. La activación del ciclo
habría reactivado en silencio las 57 filas que el humano descartó.

**Opción A aplicada:** la decisión humana se marca, no el estado.

- `.sql` aditivo: `supabase/agregar-decision-manual-inscripciones.sql`
  (`decision_manual boolean NOT NULL DEFAULT false` + `motivo text`).
- `lib/escolar/ciclo/ciclo-estado.ts`: `sincronizarInscripcionesOperativo()`
  ahora intenta leer la columna y, si no existe (42703), reintenta sin ella
  (compatibilidad aditiva). Las filas con `decision_manual=true` no se eligen,
  no se activan ni se desactivan.
- La DECISIÓN (qué activar/desactivar/qué no tocar) se movió al módulo puro
  `lib/escolar/ciclo/ciclo-estado-puro.ts`
  (`planSincronizacionInscripciones` + `aplicarPlanSincronizacion`).
- **Aplicación a la BD real** (autorizada): `scripts/migrar-marcar-decision-manual.mjs`
  marcó las 58 filas con `decision_manual=true` + motivo. La regla marca TODAS
  las inactivas que la sincronización elegiría por encima de la fila activa
  (cascada), porque la CURP `AAGC080710HVZLRRA6` tiene 3 filas con el mismo
  `created_at` y marcando solo la primera aún se invertiría hacia la segunda.
- **Regresión:** `scripts/test-reactivacion-inscripciones.mjs` (16 checks,
  pura). Antes de T1 una fila reciente inactiva se reactivaba; con la marca
  queda intacta y la elección por fecha recae en la no marcada.
- GLOSARIO actualizado: qué significa `activo` y qué significa
  `decision_manual`. Dos columnas, dos significados, escritos.

### T2 · Aliases de materia: quitar y actualizar

La mitad del mecanismo ya existía (`materias_nombres_visibles.activo` y el
fallback al idInterno). Se añadió la mitad que faltaba:

- Quitar alias = `activo = false`, **nunca DELETE** (R8, historial conservado):
  `quitarNombreVisibleMateria` en `lib/escolar/materia/nombres-visibles.ts`.
- Server Action `actionQuitarAliasMateria` que **reutiliza la capacidad
  `materia.editar_alias`** (el prompt pide no inflar la matriz). Botón «Quitar
  alias» en `MateriasConfigPanel` (solo si hay alias: nombreVisible ≠ idInterno).
- Actualización en volumen (241 materias): `actionPrevisualizarAliasArchivo`
  (NO escribe; valida contra el catálogo real) y `actionAplicarAliasArchivo`
  (escribe la MISMA lista que vio el cliente). UI: `AliasesVolumenPanel`
  (previsualizar → confirmar).
- Panel montado en `/configuracion` gobernado por `puede(materia.editar_alias)`
  (tras T5 del PROMPT-3 solo el técnico lo tiene).

### T3 · Roster: borrar y restaurar

Depende de T1: sacar a un alumno del roster es exactamente la «decisión humana».

- `lib/escolar/catalogo/roster-borrado.ts`: previsualización de arrastre
  (grupo, asistencia registrada, justificaciones, materias con filas ya
  creadas) + `aplicarBajaRoster` (activo=false + decision_manual=true + motivo)
  y `restaurarEnRoster` (activo=true + limpia la marca).
- **No borra al alumno de `ALUMNOS`** ni filas derivadas (asistencia,
  justificaciones, calificaciones se conservan).
- Capacidad nueva **`alumno.borrar_roster`** (§4 → `capacidades.ts` →
  `permisos.ts` → técnico ✅, resto X). Tres Server Actions con `exigir()`.
- UI `BajaRosterPanel` en `/configuracion`: buscar por CURP → previsualizar →
  confirmar baja, o restaurar.

### T4 · Deshacer los datos de un paso

No reimplementa `eliminar_ciclo` (el borrado total ya existe): esto es borrado
POR PASO (académico/calendario/horario/evaluaciones/roster).

- `lib/escolar/ciclo/borrar-paso.ts` (capa Supabase) + `borrar-paso-puro.ts`
  (decisión pura de bloqueo, sin BD, probable).
- Previsualizar → confirmar: conteos exactos por paso y **bloqueos** si el paso
  arrastra datos derivados (asignaciones, clases impartidas, asistencia,
  justificaciones) o si es el roster del OPERATIVO. Nunca borra en silencio.
- Capacidad nueva **`ciclo.borrar_datos`** (§4 → técnico ✅, resto X). Actions
  `actionPrevisualizarBorrarPaso` / `actionConfirmarBorrarPaso` en
  `app/actions/borrar-datos.ts`.
- Recordatorio del PROMPT-1 respetado: calendario cuelga de `periodo_id`, no se
  vuelve a la ruta por texto.
- Suite pura `scripts/test-borrar-paso.mjs` (10 checks).

### T5 · Las capacidades nuevas, por la vía correcta

`alumno.borrar_roster` y `ciclo.borrar_datos` siguieron el orden exacto:
1. fila en §4 del MATRIZ-PERMISOS.md (técnico ✅, resto X);
2. `lib/auth/capacidades.ts` (lista cerrada);
3. `lib/auth/permisos.ts` (rol técnico);
4. `exigir()` en cada action nueva;
5. `npm run gen:matriz` → «Al día.»; `test-permisos.mjs` (475 checks) confirma
   código = §4; `test-auditoria-permisos.mjs` no encontró actions sin exigir.

## 4. Qué NO se tocó (pudiendo hacerlo)

- `eliminar_ciclo` (RPC) y la partición de `asistencia_alumnos`: fuera de alcance.
- No se borró nada de `ALUMNOS`, `PROFESORES` ni ningún `.sql` existente.
- No se cambió la §4 más allá de las 2 capacidades nuevas de T5.
- No se tocó la puerta única del cambio de clave (queda para el prompt 5).
- En T4 el panel BLOQUEA el borrado del roster del OPERATIVO (debe usarse la
  baja por CURP de T3); no se ejecutó ningún borrado real de datos en este
  prompt (la migración de T1 solo marcó, nunca borró).

## 5. Archivos tocados (resumen)

- `supabase/agregar-decision-manual-inscripciones.sql` (nuevo)
- `lib/escolar/ciclo/ciclo-estado.ts` · `ciclo-estado-puro.ts`
- `lib/escolar/ciclo/borrar-paso.ts` · `borrar-paso-puro.ts` (nuevos)
- `lib/escolar/materia/nombres-visibles.ts`
- `lib/escolar/catalogo/roster-borrado.ts` (nuevo)
- `lib/escolar/catalogo/catalogo-academico.ts` (tipo `InscripcionRow` ampliado)
- `lib/auth/capacidades.ts` · `permisos.ts`
- `app/actions/materias.ts` (quitar alias + volumen)
- `app/actions/escolar.ts` (baja/restauración roster)
- `app/actions/borrar-datos.ts` (nuevo)
- `app/components/materias-config-panel.tsx` · `aliases-volumen-panel.tsx` ·
  `baja-roster-panel.tsx` · `deshacer-paso-panel.tsx`
- `app/configuracion/page.tsx` (monta los paneles por `puede()`)
- `scripts/migrar-marcar-decision-manual.mjs` ·
  `diag-inscripciones-reactivacion.mjs` · `probe-curp.mjs` ·
  `test-reactivacion-inscripciones.mjs` · `test-borrar-paso.mjs` (nuevos)
- `docs/sistema/MATRIZ-PERMISOS.md` (§4 + §5 regenerada) ·
  `docs/normativo/GLOSARIO.md` · `ESTADO-ACTUAL.md`


