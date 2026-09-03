# CIERRE — UNIFICACIÓN DEFINITIVA DE CICLOS ESCOLARES (Informe de auditoría final)

Rama: `feature/ciclo-f1-f7-sin-push` · Proyecto: WebCetac23 · Fecha: 2026-09-03
No se tocó `main`. No hay merge. No hay push a `main`. No existe `vigente` en código.

## 1. Resumen ejecutivo

La arquitectura F1–F7 **se conservó y se demostró funcionando** en el dominio puro y
en simulaciones de cliente (87 aserciones en verde, `tsc` 0 errores). Sin embargo,
**NO se declara terminada**: quedan pendientes reales que exigen acceso de escritura
a Supabase y pasos manuales del humano (SQL de migración/backfill y verificación en
producción). Este informe separa estrictamente lo demostrado de lo pendiente.

## 2. Evidencia de pruebas (Fase 11) — ejecutadas en esta sesión

| Suite | Compilación previa | Resultado |
|---|---|---|
| `scripts/test-ciclo-estado.mjs` (F1 + F4 orquestador) | `npx tsc lib/escolar/ciclo-estado.ts lib/escolar/orquestador-ciclo.ts --rootDir lib/escolar --outDir scripts/.tmp-ciclo-estado --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck` | **PASS 28/28** |
| `scripts/test-inscripciones-f3.mjs` | `... lib/escolar/inscripciones-borrador.ts --outDir scripts/.tmp-insc-f3 ...` | **PASS 13/13** |
| `scripts/test-ciclo-calendario.mjs` | `... lib/escolar/calendario.ts --outDir scripts/.tmp-cal ...` | **PASS 4/4** |
| `scripts/test-roster-validacion.mjs` | `... lib/escolar/roster-validacion.ts --outDir scripts/.tmp-rv ...` | **PASS 6/6** |
| `scripts/test-asistencia-contexto.mjs` | `... lib/escolar/asistencia-contexto.ts --outDir scripts/.tmp-ctx ...` | **PASS 6/6** |
| `scripts/test-evaluaciones.mjs` | `... evaluaciones.ts + horario-importar.ts + contexto-ciclo.ts --outDir scripts/.tmp-evaluaciones ...` | **PASS 30/30** |
| `npx tsc --noEmit` | — | **PASS** (exit 0) |
| `npm run build` | — | **NOT RUN** en esta sesión (no ejecutado; `tsc` ya cubre tipos) |
| `npm run lint` | — | **NOT RUN** en esta sesión (errores preexistentes conocidos de hooks; fuera de alcance del cierre) |

Total aserciones: **87 PASS / 0 FAIL**. Los tests usan cliente simulado en memoria;
ninguno tocó Supabase real.

## 3. Fase 1 — Matriz de dependencias (auditoría real de código)

### A. `activo` sobre `periodos` = “ciclo actual” (candidatos a autoridad `estado`)
1. `app/actions/asistencias.ts:779` — `actionObtenerCicloActual` (`select nombre`, `eq activo true`, `limit 1`).
2. `app/actions/carga-academica.ts:176` — resolver periodo activo (por nombre).
3. `app/configuracion/page.tsx:27` — ruta del configurador (solo `nombre`, legacy).
4. `lib/escolar/asistencias.ts:321` — `cargarContextoCatalogoAsistencia` (identidad de asistencia).
5. `lib/escolar/carga-academica.ts:261` — `resolvePeriodoEscolar` por nombre activo.
6. `lib/escolar/semestres.ts:225` — semestres admin.
7. `lib/escolar/ciclo-estado.ts` — activación/desactivación exclusiva (escritura `activo` al cambiar `estado`).
8. RPC `obtener_perfil_alumno` (`supabase/crear-rpc-obtener-perfil-alumno.sql:141`) — resuelve grupo solo si periodo activo (misma semántica que `resolverGrupoAlumno`).

### B. `activo` en entidades hijas (NO sustituir — semántica propia: “relación operativa actual”)
- `grupo_materias.activo`, `grupos.activo`, `inscripciones_alumno.activo`,
  `periodos_evaluacion.activo`, `semestres.activo`, `tutor_alumnos.activo`,
  `asignaciones_profesor.activo`, `configuracion_clases_profesor.activo`.
- Representan “esta relación/fila está habilitada” dentro de su periodo; se rigen
  por su propio `periodo_id` (o por el grupo), NO por exclusividad global.

### C. Vigencia de la máquina de estados
- **`vigente` no existe** en ningún archivo de código (solo mención en docs y en
  `supabase/agregar-periodo-vigente.sql`, sin ejecutar). Cumple la regla: no crear
  `vigente` todavía. La autoridad propuesta es `estado = OPERATIVO` (único) +
  `activo` como espejo legacy.
- El RPC transaccional y `activarCicloOperativo` de TS **usan `activo/estado` de
  forma exclusiva y equivalente**: al activar se marca único operativo/activo y los
  demás quedan inactivos. Los tests lo cubren (Caso5 exclusividad).


## 4. Estado por fase de la misión

| Fase | Estado | Evidencia / pendiente exacto |
|---|---|---|
| 1 Auditoría | ✅ HECHA | Matriz arriba (sección 3). |
| 2 Doble identidad calendario | ⚠️ PARCIAL | Siguen existiendo lecturas/borrados por `ciclo_escolar` en `lib/escolar/calendario.ts:148,212,316`. El plan F5 y los helpers de backfill por `periodo_id` existen y pasan tests. Pendiente: migrar acciones/UI nuevas a recibir `periodoId` y trabajar contra `calendario_escolar.periodo_id` (adaptador legacy aparte). |
| 3 Activación transaccional | ⚠️ PARCIAL | RPC transaccional existe en `supabase/crear-rpc-activar-ciclo-f4.sql` y está aplicado en Supabase real. El código TS `activarCicloOperativo` hace actualizaciones por pasos (no atómico). Pendiente: Server Action que intente RPC primero y falle si la validación/estado no es compatible; nunca escribir por pasos independientes en el flujo nuevo. |
| 4 Validación única | ⚠️ PARCIAL | `validarIntegridadCiclo` (TS, exhaustiva) y validación interna del RPC existen pero están escritas por separado. Pendiente: contrato documentado (qué valida TS antes de llamar al RPC y qué invariantes garantiza el RPC dentro de su transacción). |
| 5 Inscripciones/rollover | ⚠️ PARCIAL | Caso 1 (reactivar inscripción existente) resuelto por `sincronizarInscripcionesOperativo` + tests F3 (13/13). Caso 2 (alumno sin inscripción → flujo explícito Excel con preview/confirmación) NO implementado; prohibido reasignar masivamente. |
| 6 Asistencia | ⚠️ PARCIAL | Columnas `periodo_id` en 3 tablas aplicadas; backfill NO ejecutado (0 filas con valor). Pendiente: clasificar `matched/ambiguous/unmatched` antes de cualquier backfill y documentar regla de ambigüedad. |
| 7 Auditoría de transiciones | ✅ PARCIAL | Tabla `ciclo_transiciones` + SQL de auditoría creados y aplicados (0 filas). El flujo TS aún no registra `CREAR/CONFIGURAR/ACTIVAR/HISTORICIZAR` de forma consistente — se registra al activar si la columna existe. |
| 8 Rutas legacy | ⚠️ PARCIAL | `CicloConfigurador` ya conserva `periodoId` de punta a punta en UI. Quedan lectores legacy por `nombreCiclo/ciclo_escolar/activo` (sección 3A) que deben apuntar a `periodo_id` antes de declarar el nuevo flujo puro. |
| 9 Invariantes SQL | ✅ ENTREGADO | `supabase/verificar-integridad-ciclo.sql` (READ-ONLY, 10 invariantes con resultado PASS/WARNING/LEGACY). |
| 10 Pruebas de transición | ✅ HECHA (dominio) | En `test-ciclo-estado.mjs`: BORRADOR→OPERATIVO válido; HISTORICO→OPERATIVO bloqueado; exclusividad (B operativo ⇒ A inactivo). NOTA: fallo transaccional inducido en BD real NO se ejecutó (requiere Supabase). |
| 11 Regresión | ✅ PARCIAL | 87/87 PASS + `tsc` PASS; `build` y `lint` NOT RUN con causa (arriba). |
| 12 SQL verificación producción | ✅ ENTREGADO | `supabase/verificar-integridad-ciclo.sql` listo para ejecutar en SQL Editor (no ejecutado: requiere humano con acceso). |
| 13 Migración vs verificación | ✅ HECHA | Los SQL de escritura viven en `supabase/` con prefijos que indican efecto (`agregar-`, `crear-rpc-`, `crear-auditoria-`); el de verificación es el único `verificar-integridad-ciclo.sql` y es 100% SELECT. |

## 5. Deuda legacy cuantificada (estado real verificado en Supabase)

- 153 filas de `calendario_escolar` sin `periodo_id` (LEGACY, no error).
- 0/… filas de asistencia con `periodo_id` (columnas creadas, backfill NO hecho).
- ~105 alumnos sin inscripción activa para el ciclo operativo (NO reasignar).
- 2 periodos adicionales en BORRADOR (`AGO2026-ENE2027` con contexto como plantilla; `AGO2026-DIC2026` vacío).

## 6. Problemas restantes (no ocultos)

1. Autoridad de activación duplicada (TS por pasos vs RPC atómico): elegir RPC como única autoridad con fallback explícito.
2. Validación TS vs validación RPC no formalizada en un solo contrato.
3. Selector `listarCiclosEscolares` aún lee `calendario_escolar.ciclo_escolar`.
4. Backfill de asistencia sin regla `matched/ambiguous/unmatched` aplicada.
5. Lint preexistente (`react-hooks/set-state-in-effect`) y `npm run build`/`lint` NO ejecutados en esta sesión.

## 7. Orden recomendado de implementación

1. Server Action `activarCicloDesdeAccion` → RPC `activar_ciclo_operativo` (única autoridad) + registrar `ciclo_transiciones`; fallback TS solo cuando el RPC no exista.
2. Contrato de validación en un único lugar consumido por TS y documentado contra el RPC.
3. Migrar `calendario.ts`/acciones/panel/paso-calendario a `periodo_id` (eliminar `ciclo_escolar` del flujo nuevo; adaptador legacy aparte).
4. Backfill de asistencia con clasificación `matched/ambiguous/unmatched` en SQL de verificación + script de migración con preview.
5. Reasignación explícita de alumnos (Caso 2) con preview/confirmación vía wizard.

## 8. Conclusión final (regla de oro)

- **SÍ demostrado:** el flujo `periodos.id → periodo_id → dominios` funciona en los
  módulos nuevos; la máquina de estados y la exclusividad están validadas por tests;
  `vigente` no se creó; `main` quedó intacto; el SQL de verificación de producción está listo.
- **NO declarado “arquitectura terminada”**: falta ejecutar `verificar-integridad-ciclo.sql`
  en producción, elegir la autoridad única de activación, migrar lectores legacy a
  `periodo_id` y ejecutar `build`/`lint` con el repo limpio. El ciclo real de
  `CREAR → BORRADOR → CONFIGURAR → VALIDAR → ACTIVAR → OPERATIVO → HISTORICO`
  debe demostrarse en Supabase real antes de cerrar la misión.

