# F4 — Orquestación del ciclo y activación (semi) atómica

## Qué se implementó
- `lib/escolar/orquestador-ciclo.ts`:
  - `crearCicloConContexto()` — crea BORRADOR (nunca activa) y opcionalmente
    clona grupos+materias desde un origen (`clonarContextoAcademico`),
    devolviendo validación/conteos para que el directivo continúe en F2/F3.
  - `registrarTransicionCiclo()` — auditoría NO bloqueante hacia
    `ciclo_transiciones` (solo escribe si la tabla existe).
  - `estadoCicloParaAction()`.
- `app/actions/ciclo-orquestador.ts` → `actionCrearCicloConContexto` (directivo).
- `lib/escolar/ciclo-estado.ts` → guardas F4 en `activarCicloOperativo`:
  un HISTORICO (esquema F1) no puede reactivarse; el único OPERATIVO es
  idempotente; continúa la sincronización de inscripciones existente (F3).
- `supabase/crear-rpc-activar-ciclo-f4.sql` — función PostgreSQL transaccional
  `activar_ciclo_operativo(p_periodo)` (validaciones SQL + exclusividad +
  sincronización de inscripciones; ROLLBACK automático). PREPARADA.
- `supabase/crear-auditoria-ciclo.sql` — tabla `ciclo_transiciones` (aditiva).

## Atomicidad
El entorno actual solo dispone de REST (sin DDL/RPC): **no se puede ejecutar**
la función. El código JS se mantiene idempotente y reintentable y documenta por
qué. Al aplicar el SQL en el SQL Editor, la Server Action puede invocar la RPC
(siguiente paso) o confiar en el flujo JS existente.

## Pruebas F4 (añadidas a test-ciclo-estado.mjs)
- HISTORICO no puede reactivarse.
- Ya único OPERATIVO → ok idempotente.
- Orquestador crea BORRADOR `activo=false` sin clonado.

## SQL pendiente (manual)
`supabase/crear-rpc-activar-ciclo-f4.sql` · `supabase/crear-auditoria-ciclo.sql`
· `supabase/agregar-estado-ciclo.sql` (F1).
