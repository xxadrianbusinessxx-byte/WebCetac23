// test-ciclo-calendario.mjs — Pruebas F5 (plan puro de backfill calendario→periodo).
// Ejecutar (Node carga los .ts de lib/ directamente; no hay paso de compilar): node scripts/test-ciclo-calendario.mjs
const CAL = await import("../lib/escolar/ciclo/calendario.ts");

let pasadas = 0;
let fallidas = 0;
function ok(nombre, condicion, detalle = "") {
  if (condicion) { pasadas++; console.log(`ok ${nombre}`); }
  else { fallidas++; console.error(`FALLA ${nombre} ${detalle}`); }
}

// 1) Nombre exacto → match con el periodo correcto.
{
  const plan = CAL.planBackfillCalendario(
    [{ id: "cal1", ciclo_escolar: "2026-2027", fecha: "2026-09-01" }],
    [{ id: "pA", nombre: "2026-2027" }],
  );
  ok("F5: match por nombre exacto", plan[0].estado === "match" && plan[0].periodoId === "pA", JSON.stringify(plan[0]));
}

// 2) Normalización (mayúsculas/espacios) no rompe el match.
{
  const plan = CAL.planBackfillCalendario(
    [{ id: "cal2", ciclo_escolar: " 2027-2028 ", fecha: "2027-09-01" }],
    [{ id: "pB", nombre: "2027-2028" }],
  );
  ok("F5: normalización por nombre", plan[0].estado === "match" && plan[0].periodoId === "pB", JSON.stringify(plan[0]));
}

// 3) Calendario huérfano → sin_match (no inventa relación).
{
  const plan = CAL.planBackfillCalendario(
    [{ id: "calH", ciclo_escolar: "SEMESTRE AGO26-ENE27", fecha: "2026-09-01" }],
    [{ id: "pA", nombre: "2026-2027" }],
  );
  ok("F5: huérfano detectado (sin_match)", plan[0].estado === "sin_match" && plan[0].periodoId === null, JSON.stringify(plan[0]));
}

// 4) Ambiguo cuando dos periodos normalizan igual (no decide por nosotros).
{
  const plan = CAL.planBackfillCalendario(
    [{ id: "calAm", ciclo_escolar: "2026-2027", fecha: "2026-09-01" }],
    [
      { id: "p1", nombre: "2026-2027" },
      { id: "p2", nombre: "2026-2027" },
    ],
  );
  ok("F5: ambiguo detectado", plan[0].estado === "ambiguo" && plan[0].periodoId === null, JSON.stringify(plan[0]));
}

console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
