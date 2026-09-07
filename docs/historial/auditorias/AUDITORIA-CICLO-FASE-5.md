# FASE 5 — CALENDARIO POR `periodo_id` (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## 1. Flujo anterior (eliminado del flujo nuevo)
```text
periodoId → nombreCiclo → calendario_escolar.ciclo_escolar TEXT (filtro)
```
## 2. Flujo nuevo
```text
periodoId
   ↓
calendario_escolar.periodo_id
   ↓
lectura / guardado / eliminación / base
```
`ciclo_escolar` sigue escribiéndose (nombre normalizado) SOLO para respetar la
UNIQUE legacy `(ciclo_escolar, fecha)` y no romper consumidores antiguos; ya no
es el filtro de identidad del flujo nuevo.

## 3. Auditoría (clasificación)

| Archivo | Referencia | Clasificación | Cambio |
|---|---|---|---|
| `ciclo-configurador/paso-calendario.tsx` | `cicloInicial={nombreCiclo}` descartando `periodoId` | A | ✅ IMPLEMENTADO: pasa `periodoIdInicial={periodoId}` + `periodoNombre` (visual) |
| `calendario-escolar-panel.tsx` | selector/lectura/escritura por nombre | A | ✅ IMPLEMENTADO: prop `periodoIdInicial`; en `modoPeriodo` lee/guarda/elimina/establece base por acciones `*DePeriodo` |
| `app/actions/calendario.ts` | `ciclo: string` en 4 acciones | A | ✅ IMPLEMENTADO: nuevas acciones `*DePeriodo` (periodoId); las antiguas quedan como LEGACY (consumidores externos) |
| `lib/escolar/calendario.ts` | `.eq("ciclo_escolar", ...)` (obtener, guardar, eliminar, base) | B LEGACY CONTROLADO | ✅ Conservadas para registros sin `periodo_id`; flujo nuevo añade `obtenerCalendarioDePeriodo`, `guardarDiaCalendarioDePeriodo`, `eliminarDiaCalendarioDePeriodo`, `establecerCalendarioBaseDePeriodo` |
| `calendario_escolar.periodo_id` (SQL previo) | columna + UNIQUE parcial `(periodo_id, fecha)` | A | ✅ Base lista; SQL real ya aplicado en Supabase (81/234) según cierre previo; backfill NO hecho aquí |
| `ciclo_escolar` de registros con `periodo_id IS NULL` | 153 filas | C DATOS HISTÓRICOS | 🚫 NO migrados (sin backfill; F9/F10) |

## 4. Contrato nuevo (domain + actions)
```ts
obtenerCalendarioDePeriodo(supabase, periodoId, periodoNombre): DiaCalendarioRow[]
guardarDiaCalendarioDePeriodo(supabase, {periodoId, periodoNombre, fecha, tipo, ...})
eliminarDiaCalendarioDePeriodo(supabase, periodoId, fecha)
establecerCalendarioBaseDePeriodo(supabase, {periodoId, periodoNombre, inicio, fin, ...})
// Server Actions espejo: actionObtener/Guardar/Eliminar/Establecer*DePeriodo
```

## 5. Compatibilidad legacy
El modo legacy (panel sin `periodoIdInicial`, usado fuera del configurador)
conserva su selector por `ciclo_escolar` y las acciones antiguas; el modo periodo
del wizard nunca convierte `periodoId → nombreCiclo` para consultar.

## 6. Test
```text
test-auditoria-ciclo-f5.mjs        20/20 PASS
test-calendario-periodo-f5.mjs      7/7  PASS  (A aislamiento, B dos periodos,
                                               C legacy NULL excluido, D mismo nombre,
                                               guardar/eliminar/base por periodo)
test-auditoria-ciclo-f0.mjs        29/29 PASS  (regresión; expectativa F0 actualizada)
test-ciclo-calendario.mjs           4/4  PASS
npx tsc --noEmit                   PASS (exit 0)
```

## 7. SQL
- Preparado: el flujo nuevo solo requiere la columna/índice de
  `supabase/agregar-periodo-id-calendario.sql` (ya aplicado en Supabase real).
- Backfill de las 153 filas huérfanas: NO EJECUTADO (F9/F10).
- SQL real en esta fase: NO EJECUTADO (ninguna sentencia nueva).

## 8. Riesgos restantes
1. Dos periodos con el mismo nombre y la misma fecha colisionarían en la UNIQUE
   legacy `(ciclo_escolar, fecha)` (constraint heredada; decisión de esquema F9).
2. Las 153 filas legacy sin `periodo_id` solo son visibles por el selector
   antiguo; el flujo nuevo no las muestra (correcto por diseño).
3. La UI del modo periodo conserva el selector de ciclos oculto/vacío y el input
   de nombre (cosmético); todas las operaciones ya van por `periodo_id`.

## 9. Fuera de F5
F1 cerrado. Excel académico/alumnos (F2/F3), parciales (F4), horario (F6),
validación única (F7), activación (F8), asistencia/backfill (F9).
