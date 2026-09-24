#!/usr/bin/env node
/**
 * test-reactivacion-inscripciones.mjs — PROMPT-4/T1 (opción A) suite de
 * regresión: reactivar el ciclo NO invierte una decisión manual.
 *
 * Pura (sin BD): carga `lib/escolar/ciclo/ciclo-estado-puro.ts` y prueba
 * `planSincronizacionInscripciones` / `aplicarPlanSincronizacion`.
 *
 * Escenario real (medido 2026-09-06): 92 CURPs con >1 fila en el operativo, y
 * en 57 de ellos la fila MÁS RECIENTE está hoy INACTIVA (decisión humana de la
 * deduplicación del PROMPT-1/T3). Antes de T1, sincronizarInscripciones
 * elegiría esa fila reciente inactiva y la reactivaría (inversión silenciosa).
 * Con T1, esas filas se marcan `decision_manual=true` y quedan intactas.
 *
 * Uso: node scripts/test-reactivacion-inscripciones.mjs
 */
// Node carga el `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar a CommonJS.
const {
  planSincronizacionInscripciones,
  aplicarPlanSincronizacion,
} = await import("../lib/escolar/ciclo/ciclo-estado-puro.ts");

let pasos = 0;
let fallos = 0;
function ok(cond, nombre) {
  pasos++;
  if (cond) console.log(`  OK ${nombre}`);
  else {
    fallos++;
    console.error(`  FALLA ${nombre}`);
  }
}
function seccion(t) {
  console.log(`\n${t}`);
}

const fila = (id, curp, activo, created_at, decision_manual = false) => ({
  id,
  curp,
  grupo_id: "grupo-x",
  activo,
  decision_manual,
  created_at,
});

// ---------------------------------------------------------------------------
// 1) Escenario real sintetizado: CURP con 2 filas; la más reciente está
//    inactiva (la descartó un humano). Sin marca → se invertiría. Con marca
//    (T1) → queda intacta y la siguiente por fecha gobierna.
// ---------------------------------------------------------------------------
seccion("Escenario 57: la fila más reciente inactiva fue una decisión humana");
{
  const curp = "CURPREAL01";
  const vieja = fila("aaa", curp, true, "2026-09-01T00:00:00Z"); // activa hoy
  const reciente = fila("bbb", curp, false, "2026-09-02T00:00:00Z"); // descartada
  // Sin la marca (comportamiento pre-T1): la reactiva → inversión.
  const planViejo = planSincronizacionInscripciones([vieja, reciente]);
  ok(
    planViejo.activarIds.includes("bbb"),
    "SIN marca: la fila reciente inactiva se reactivaría (el defecto que T1 cierra)",
  );

  // Con la marca (T1): no la toca.
  const marcada = { ...reciente, decision_manual: true };
  const plan = planSincronizacionInscripciones([vieja, marcada]);
  ok(!plan.activarIds.includes("bbb"), "T1: la fila marcada NO entra en activarIds");
  ok(!plan.desactivarIds.includes("bbb"), "T1: la fila marcada NO entra en desactivarIds");
  ok(plan.intactasIds.includes("bbb"), "T1: la fila marcada se lista como intacta");
  const final = aplicarPlanSincronizacion([vieja, marcada], plan);
  ok(
    final.find((f) => f.id === "bbb")?.activo === false,
    "T1: tras aplicar el plan la fila marcada sigue inactiva (no se invierte)",
  );
}

// ---------------------------------------------------------------------------
// 2) Con la marcada excluida, la elección por fecha recae en la NO marcada.
// ---------------------------------------------------------------------------
seccion("La fecha decide solo entre lo que el humano no marcó");
{
  const curp = "CURPREAL02";
  const masVieja = fila("ccc", curp, false, "2026-09-01T00:00:00Z");
  const intermedia = fila("ddd", curp, true, "2026-09-02T00:00:00Z");
  const masRecienteMarcada = fila("eee", curp, false, "2026-09-03T00:00:00Z", true);
  const plan = planSincronizacionInscripciones([
    masVieja,
    intermedia,
    masRecienteMarcada,
  ]);
  ok(!plan.activarIds.includes("eee"), "la más reciente marcada no se activa");
  // Sin la marcada, la elegida es la intermedia (2026-09-02), que ya está activa.
  ok(!plan.activarIds.includes("ddd"), "la intermedia activa no necesita reactivarse");
  ok(
    !plan.desactivarIds.includes("ddd"),
    "la intermedia activa no se desactiva (es la elegida entre las no marcadas)",
  );
  ok(
    plan.desactivarIds.length === 0,
    "nada que desactivar: ccc ya está inactiva y no es la elegida",
  );
}

// ---------------------------------------------------------------------------
// 3) Comportamiento anterior conservado cuando NO hay marcas (regresión).
// ---------------------------------------------------------------------------
seccion("Sin marcas, el comportamiento previo se conserva");
{
  const curp = "CURPREAL03";
  const vieja = fila("fff", curp, true, "2026-09-01T00:00:00Z");
  const reciente = fila("ggg", curp, false, "2026-09-02T00:00:00Z");
  const plan = planSincronizacionInscripciones([vieja, reciente]);
  ok(plan.activarIds.includes("ggg"), "reactiva la más reciente inactiva");
  ok(plan.desactivarIds.includes("fff"), "desactiva la anterior activa");
}

// ---------------------------------------------------------------------------
// 4) 3+ filas: solo una queda activa tras sincronizar.
// ---------------------------------------------------------------------------
seccion("Una sola activa por CURP tras sincronizar (invariante)");
{
  const curp = "CURPREAL04";
  const a = fila("h1", curp, true, "2026-09-01T00:00:00Z");
  const b = fila("h2", curp, true, "2026-09-02T00:00:00Z");
  const c = fila("h3", curp, true, "2026-09-03T00:00:00Z");
  const plan = planSincronizacionInscripciones([a, b, c]);
  const final = aplicarPlanSincronizacion([a, b, c], plan);
  ok(
    final.filter((f) => f.activo).length === 1,
    "exactamente una activa al final",
  );
  ok(final.find((f) => f.id === "h3")?.activo === true, "la más reciente es la que queda");
}

// ---------------------------------------------------------------------------
// 5) Una CURP con todas sus filas marcadas: nada cambia.
// ---------------------------------------------------------------------------
seccion("Todas marcadas → la sincronización no toca nada de esa CURP");
{
  const curp = "CURPREAL05";
  const a = fila("j1", curp, true, "2026-09-01T00:00:00Z", true);
  const b = fila("j2", curp, false, "2026-09-02T00:00:00Z", true);
  const plan = planSincronizacionInscripciones([a, b]);
  ok(plan.activarIds.length === 0, "nada se activa");
  ok(plan.desactivarIds.length === 0, "nada se desactiva");
  ok(plan.intactasIds.length === 2, "ambas quedan intactas");
}

console.log(`\nResultado: ${pasos} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);

