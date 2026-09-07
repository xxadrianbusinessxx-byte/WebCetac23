# INFORME — Prompt A: reparar `tabla_legacy` del ciclo operativo (puente de materias)

Fecha: 2026-09-04 · Ejecutado según `docs/PROMPT_CLINE_A_REPARAR_TABLA_LEGACY.md`.

### Implementado
- `clonarContextoAcademico` YA propaga `tabla_legacy`: lee el puente en el
  `select` del origen, lo incluye en las filas insertadas y cuenta en el
  resumen `materiasSinTablaLegacy` (origen sin puente → se inserta null).
- Plan PURO `planRepararTablaLegacy(gmDestino, gruposDestino, gmOrigen,
  gruposOrigen)` con estados `match | ya_tiene | sin_origen | ambiguo`,
  emparejando por `grado|grupo|carrera` + `materia_id`; ambiguo nunca elige.
- Aplicación `repararTablaLegacyDePeriodo` (con flag `soloPlan` para preview):
  4 consultas de lectura y UPDATEs por lotes agrupados por valor; idempotente.
- Server Actions `actionPrevisualizarRepararTablaLegacy` (no escribe) y
  `actionRepararTablaLegacy` (escribe): solo `directivo`, periodos validados.
- UI en el paso Académico del `CicloConfigurador`: selector de ciclo origen,
  botón "Ver preview" y "Aplicar reparación" (se habilita solo con preview ok y
  match > 0).

### Validación
- `npx tsc --noEmit` → 0 errores · `npm run lint` → sin errores nuevos ·
  `npm run build` → exit 0.
- `test-reparar-tabla-legacy` 15/15 (match, ya_tiene, ambiguo, sin_origen,
  idempotencia, carreras 3RO A MECATRONICA vs RH).
- Diagnóstico ANTES (`node scripts/diag-materias-alumno.mjs`):
  `AGO2026-ENE2027 gmAct=241 · conTabla=0 (0%)`; RPC `identidades: 0`.
- "DESPUÉS" no se puede producir desde Cline (la reparación escribe en
  producción): corresponde al directivo correr preview (esperado: 241 match /
  0 ambiguos con origen `2026-2027`) y aplicar; el criterio de éxito es
  `conTabla=241 (100%)` e `identidades: 10` para ZAFA100523MVZPMMA6.

### Nota
La reparación no se ejecuta sola: Cline entrega el botón + preview + plan.
