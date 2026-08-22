/**
 * Pruebas de la capa canónica de fechas (Bloque 5E).
 *
 * Verifica `normalizarFechaEscolar` y `detectarColumnasFechaAsistencia` contra
 * los formatos que puede producir Excel/Sheets/CSV al editar una plantilla de
 * asistencias. NO requiere Supabase: son funciones puras.
 *
 * Uso:
 *   node scripts/test-fechas.mjs
 */

// Importa el módulo compilado a JS (ver PASO de compilación en el README del
// script). Para recompilar tras cambios en lib/escolar/fechas.ts:
//   npx tsc lib/escolar/fechas.ts --outDir scripts/.tmp-fechas \
//     --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
const {
  normalizarFechaEscolar,
  detectarColumnasFechaAsistencia,
  serialExcelAFechaISO,
} = await import("./.tmp-fechas/fechas.js");



let pasadas = 0;
let fallidas = 0;

function ok(nombre, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallidas++;
    console.error(`  ✗ ${nombre} ${detalle}`);
  }
}

// ============================================================================
// CASO A: ISO canónico (lo que genera la plantilla original).
// ============================================================================
console.log("\nA) ISO canónico YYYY-MM-DD");
{
  const r = normalizarFechaEscolar("2026-08-24");
  ok("2026-08-24 → ok", r.ok && r.fecha === "2026-08-24", JSON.stringify(r));
}

// ============================================================================
// CASO B: Separadores con año primero.
// ============================================================================
console.log("\nB) Separadores con año primero");
{
  ok("2026/08/24 → 2026-08-24",
    normalizarFechaEscolar("2026/08/24").ok &&
    normalizarFechaEscolar("2026/08/24").fecha === "2026-08-24");
  ok("2026.08.24 → 2026-08-24",
    normalizarFechaEscolar("2026.08.24").ok &&
    normalizarFechaEscolar("2026.08.24").fecha === "2026-08-24");
}

// ============================================================================
// CASO C: Regional día primero (DD/MM/YYYY) — lo que produce Excel en es-MX.
// ============================================================================
console.log("\nC) Regional día primero (DD/MM/YYYY)");
{
  const r = normalizarFechaEscolar("24/08/2026");
  ok("24/08/2026 → 2026-08-24", r.ok && r.fecha === "2026-08-24", JSON.stringify(r));
  ok("24-08-2026 → 2026-08-24",
    normalizarFechaEscolar("24-08-2026").ok &&
    normalizarFechaEscolar("24-08-2026").fecha === "2026-08-24");
  ok("24.08.2026 → 2026-08-24",
    normalizarFechaEscolar("24.08.2026").ok &&
    normalizarFechaEscolar("24.08.2026").fecha === "2026-08-24");
}

// ============================================================================
// CASO D: Regional mes primero (MM/DD/YYYY) — lo que produce Excel en en-US.
// ============================================================================
console.log("\nD) Regional mes primero (MM/DD/YYYY)");
{
  const r = normalizarFechaEscolar("08/24/2026");
  ok("08/24/2026 → 2026-08-24", r.ok && r.fecha === "2026-08-24", JSON.stringify(r));
}

// ============================================================================
// CASO E: Serial de fecha Excel (número).
// ============================================================================
console.log("\nE) Serial de fecha Excel");
{
  // 2026-08-24 en Excel (serial). Verificamos con la función inversa.
  const serial = 46255; // 2026-08-24 (aproximado; se valida contra fechaISO)
  const iso = serialExcelAFechaISO(serial);
  ok(`serial ${serial} → fecha ISO`, iso !== null && /^\d{4}-\d{2}-\d{2}$/.test(iso ?? ""), `→ ${iso}`);
  // El serial debe corresponder a una fecha real.
  const r = normalizarFechaEscolar(serial);
  ok(`normalizarFechaEscolar(${serial}) → ok`, r.ok, JSON.stringify(r));
}

// ============================================================================
// CASO F: Ambigüedad real (día/mes vs mes/día).
// ============================================================================
console.log("\nF) Ambigüedad real");
{
  const r = normalizarFechaEscolar("05/06/2026");
  ok("05/06/2026 → ambigua", !r.ok && r.motivo === "ambigua", JSON.stringify(r));
  ok("candidatos incluyen 2026-06-05 y 2026-05-06",
    r.ok === false && r.motivo === "ambigua" &&
    r.candidatos.includes("2026-06-05") &&
    r.candidatos.includes("2026-05-06"),
    JSON.stringify(r));
}

// ============================================================================
// CASO G: Fecha imposible.
// ============================================================================
console.log("\nG) Fechas imposibles");
{
  ok("31/02/2026 → fecha_imposible",
    !normalizarFechaEscolar("31/02/2026").ok &&
    normalizarFechaEscolar("31/02/2026").motivo === "fecha_imposible");
  ok("2026-13-01 → fecha_imposible",
    !normalizarFechaEscolar("2026-13-01").ok &&
    normalizarFechaEscolar("2026-13-01").motivo === "fecha_imposible");
  ok("texto no fecha → formato",
    !normalizarFechaEscolar("CURP").ok &&
    normalizarFechaEscolar("CURP").motivo === "formato");
  ok("vacío → vacio",
    !normalizarFechaEscolar("").ok &&
    normalizarFechaEscolar("").motivo === "vacio");
}

// ============================================================================
// CASO H: Date de JavaScript.
// ============================================================================
console.log("\nH) Date de JavaScript");
{
  const r = normalizarFechaEscolar(new Date(2026, 7, 24)); // 24 ago 2026
  ok("new Date(2026,7,24) → 2026-08-24", r.ok && r.fecha === "2026-08-24", JSON.stringify(r));
}

// ============================================================================
// CASO I: Detección de columnas contra calendario.
// ============================================================================
console.log("\nI) Detección de columnas de fecha");
{
  const calendario = [
    { id: "1", ciclo_escolar: "2026-2027", fecha: "2026-08-24", tipo: "clase", descripcion: null, creado_por: null, created_at: null },
    { id: "2", ciclo_escolar: "2026-2027", fecha: "2026-08-25", tipo: "clase", descripcion: null, creado_por: null, created_at: null },
    { id: "3", ciclo_escolar: "2026-2027", fecha: "2026-08-26", tipo: "mantenimiento", descripcion: null, creado_por: null, created_at: null },
    { id: "4", ciclo_escolar: "2026-2027", fecha: "2026-08-27", tipo: "clase", descripcion: null, creado_por: null, created_at: null },
  ];

  // Encabezados editados en Excel (formato regional) + CURP/NOMBRE.
  const encabezados = ["CURP", "NOMBRE", "24/08/2026", "25/08/2026", "26/08/2026", "27/08/2026"];
  const det = detectarColumnasFechaAsistencia(encabezados, calendario, [0, 1]);

  ok("detecta 3 días de clase (24,25,27)", det.columnas.length === 3, JSON.stringify(det.columnas.map(c => c.fecha)));
  ok("excluye el día de mantenimiento (26)", det.noDiaClase === 1, `noDiaClase=${det.noDiaClase}`);
  ok("fechas correctas", 
    det.columnas.map(c => c.fecha).join(",") === "2026-08-24,2026-08-25,2026-08-27",
    det.columnas.map(c => c.fecha).join(","));
}

// ============================================================================
// CASO J: Encabezados ISO sin editar (plantilla original).
// ============================================================================
console.log("\nJ) Encabezados ISO (plantilla original)");
{
  const calendario = [
    { id: "1", ciclo_escolar: "2026-2027", fecha: "2026-08-24", tipo: "clase", descripcion: null, creado_por: null, created_at: null },
  ];
  const det = detectarColumnasFechaAsistencia(["CURP", "NOMBRE", "2026-08-24"], calendario, [0, 1]);
  ok("detecta 2026-08-24", det.columnas.length === 1 && det.columnas[0].fecha === "2026-08-24", JSON.stringify(det.columnas));
}

// ============================================================================
// CASO K: Sin columnas de fecha válidas → error claro.
// ============================================================================
console.log("\nK) Sin columnas de fecha válidas");
{
  const calendario = [
    { id: "1", ciclo_escolar: "2026-2027", fecha: "2026-08-24", tipo: "clase", descripcion: null, creado_por: null, created_at: null },
  ];
  const det = detectarColumnasFechaAsistencia(["CURP", "NOMBRE", "NOTA"], calendario, [0, 1]);
  ok("no detecta columnas", det.columnas.length === 0, JSON.stringify(det));
}

// ============================================================================
// CASO L: Serial Excel como texto numérico.
// ============================================================================
console.log("\nL) Serial Excel como texto");
{
  const r = normalizarFechaEscolar("46255");
  ok("'46255' → fecha ISO", r.ok, JSON.stringify(r));
}

// ============================================================================
// RESUMEN
// ============================================================================
console.log(`\n========================================`);
console.log(`Resultado: ${pasadas} pasadas, ${fallidas} fallidas`);
console.log(`========================================`);
if (fallidas > 0) process.exit(1);
