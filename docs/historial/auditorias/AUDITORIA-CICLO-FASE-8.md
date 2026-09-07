# FASE 8 — ACTIVACIÓN TRANSACCIONAL ÚNICA (informe)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## 1. Flujo anterior
```text
CicloConfigurador → actionSetActivoCiclo → setActivoCiclo
  → activarCicloOperativo() TS  (validación + apagar/encender por pasos REST)
  → sincronizarInscripcionesOperativo() (pasos REST)  → SIN auditoría de activación
```

## 2. Flujo nuevo
```text
UI → actionSetActivoCiclo (autorización directivo)
   → setActivoCiclo → activarCicloOperativoAtomico()
   → RPC activar_ciclo_operativo(periodo_id)   ← ÚNICA autoridad de mutación
   → transacción única (validación + exclusividad + inscripciones + auditoría) / ROLLBACK
```
Si la RPC no está desplegada: error explícito (sin secuencia multi-paso de respaldo).

## 3. Matriz TS vs RPC (auditada sobre código real, no inventada)

| Regla/efecto | TS actual | RPC actual | ¿Equivalentes? | Decisión |
|---|---|---|---|---|
| periodo existe | consultarPeriodo | SELECT nombre | ✅ | ambas |
| histórico bloqueado | sí | sí (si col estado) | ✅ | ambas |
| grupos activos>0 | validarIntegridad | count grupos | ✅ | RPC |
| grupo_materias activos>0 | validarIntegridad | join g/gm activos | ✅ | RPC |
| alumnos inscritos | validarIntegridad | count DISTINCT curp | ⚠️ RPC sin exigir activo | aceptado (contracto actual) |
| evaluaciones/parciales | conteos (no bloqueante) | — | ❌ RPC no valida | documentado; no bloqueante |
| calendario/días de clase | conteo (no bloqueante) | — | ❌ RPC no valida | documentado; no bloqueante |
| horario | no valida | — | ✅ ausente en ambas | documentado |
| desactivar anterior | por pasos REST | UPDATE atómico | ⚠️ TS no atómico | RPC |
| activar objetivo | por pasos REST | UPDATE atómico | ⚠️ TS no atómico | RPC |
| estado BORRADOR→OPERATIVO | sí | sí | ✅ | RPC |
| `activo` espejo | sí | sí | ✅ | RPC |
| sincronizar inscripciones | TS idempotente por pasos | UPDATE DISTINCT ON por CURP (desactiva otros) | ⚠️ misma regla, RPC atómico | RPC |
| auditoría ciclo_transiciones | NO registra | ahora INSERT no bloqueante dentro de tx (preparado) | ➕ mejora RPC | RPC |
| idempotencia (ya único operativo) | ok mensaje | ahora RETURN controlado | ✅ | RPC |
| rollback ante error | NO (riesgo 0 operativos) | SÍ (función plpgsql) | ❌ | RPC |
| `vigente` | — | — | ✅ no existe | no se crea |

## 4. Decisiones
1. `activar_ciclo_operativo(periodo_id)` es la autoridad única del flujo nuevo.
2. `activarCicloOperativo()` TS queda como función legacy (solo para compatibilidad/tests), fuera del flujo de `setActivoCiclo`.
3. Auditoría de activación dentro de la transacción, **no bloqueante** (EXCEPTION…NULL): una falla de auditoría no aborta una activación válida (contrato explícito).
4. Reglas de evaluación/calendario no son bloqueantes hoy en TS (conteos informativos) → no se copian al RPC.
5. Inscripciones: la RPC sincroniza igual que TS (desactiva otros, activa la más reciente por CURP del nuevo operativo); el caso “alumno sin inscripción” sigue siendo responsabilidad de F3 (no F8).

## 5. Tests
```text
test-auditoria-ciclo-f8.mjs     15/15 PASS
test-activacion-ciclo-f8.mjs     5/5  PASS (contrato con mocks)
test-ciclo-estado.mjs           33/33 PASS (regresión)
npx tsc --noEmit                PASS (exit 0)
```
Atomicidad: **CONTRATO COMPROBADO** (mock valida llamada RPC, propagación de errores y veto del multi-paso). **PENDIENTE DE PRUEBA REAL EN SUPABASE** (la RPC no se ejecutó contra PostgreSQL en esta sesión).

## 6. SQL
- Preparado (NO EJECUTADO): `supabase/crear-rpc-activar-ciclo-f4.sql` con 2 mejoras idempotentes: retorno controlado “ya es el único OPERATIVO” y auditoría `ciclo_transiciones` dentro de la transacción.
- SQL real: **NO EJECUTADO**. La versión de la RPC actualmente en Supabase NO incluye estas mejoras → el despliegue de la nueva función es requisito previo para que el botón use idempotencia+auditoría (aplicar en SQL Editor por el humano).

## 7. Seguridad
La Server Action conserva `rol === "directivo"`. No se cambiaron RLS/GRANTs. La RPC hereda el mecanismo existente (SECURITY DEFINER definido en el SQL previo) — no alterado.

## 8. Riesgos restantes
1. RPC mejorada sin desplegar en Supabase (requisito F8→producción).
2. `setActivoCiclo(activo=false)` (historicizar) sigue por `marcarCicloNoOperativo` TS (fuera del alcance de activación; documentado).
3. Prueba de rollback real (caso 3: error tras desactivar anterior) requiere Supabase real.
4. UI conserva botón de activar habilitado según `d.ok` de validación previa (contrato F7 posterior).
