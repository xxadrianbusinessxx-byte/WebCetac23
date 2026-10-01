#!/usr/bin/env node
/**
 * test-justificaciones-puro.mjs — suite pura de `lib/escolar/asistencia/justificaciones-puro.ts`.
 *
 * QUÉ MIDE: el núcleo puro de justificación por clase: qué materia tiene clase
 *           ese día, cuántas clases se justifican, si un nombre de archivo es
 *           seguro y la ruta del adjunto.
 * QUÉ ESCRIBE: nada. Carga el `.ts` directamente. No toca la base ni la red.
 * CÓMO SE EJECUTA: node scripts/test-justificaciones-puro.mjs
 */
const J = await import("../lib/escolar/asistencia/justificaciones-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/* ── Materia con clase ese día ─────────────────────────────────────────── */
console.log("\nmateria con clase");
ok("materia con bloques ese día", J.materiaTieneClaseEnDia({ MAT: 2 }, "MAT"));
ok("la clave se compara tal cual (case-sensitive)", !J.materiaTieneClaseEnDia({ MAT: 2 }, "mat"));
ok("sin bloques no tiene clase", !J.materiaTieneClaseEnDia({ ING: 1 }, "MAT"));
ok("clave vacía no tiene clase", !J.materiaTieneClaseEnDia({ MAT: 2 }, ""));
ok("clave null no tiene clase", !J.materiaTieneClaseEnDia({ MAT: 2 }, null));

/* ── Clases justificadas por día ───────────────────────────────────────── */
console.log("\nclases justificadas");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: { MAT: 2, ING: 1 }, materias: ["MAT"], faltante: 5 }), 2, "suma bloques de la materia");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: { MAT: 2, ING: 1 }, materias: ["MAT", "ING"], faltante: 2 }), 2, "tope en el faltante");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: { MAT: 2 }, materias: [null], faltante: 3 }), 3, "día completo → faltante entero");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: { MAT: 2 }, materias: [""], faltante: 3 }), 3, "cadena vacía → día completo");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: { MAT: 2 }, materias: ["MAT", "MAT"], faltante: 5 }), 2, "repetir materia NO acumula (idempotente)");
eq(J.calcularClasesJustificadasPorDia({ bloquesPorMateria: {}, materias: ["MAT"], faltante: 0 }), 0, "faltante 0 → 0");

/* ── Nombre de archivo seguro ──────────────────────────────────────────── */
console.log("\nnombre de archivo");
ok("pdf válido", J.esNombreArchivoJustificacionSeguro("archivo.pdf"));
ok("extensión en mayúsculas vale", J.esNombreArchivoJustificacionSeguro("archivo.PDF"));
ok("png válido", J.esNombreArchivoJustificacionSeguro("archivo.png"));
ok("exe rechazado", !J.esNombreArchivoJustificacionSeguro("archivo.exe"));
ok("ruta relativa rechazada", !J.esNombreArchivoJustificacionSeguro("../archivo.pdf"));
ok("subcarpeta rechazada", !J.esNombreArchivoJustificacionSeguro("dir/archivo.pdf"));
ok("barra invertida rechazada", !J.esNombreArchivoJustificacionSeguro("dir\\archivo.pdf"));
ok("oculto (punto inicial) rechazado", !J.esNombreArchivoJustificacionSeguro(".archivo.pdf"));
ok("vacío rechazado", !J.esNombreArchivoJustificacionSeguro(""));
ok("demasiado largo rechazado", !J.esNombreArchivoJustificacionSeguro("a".repeat(121) + ".pdf"));

/* ── Ruta del adjunto ──────────────────────────────────────────────────── */
console.log("\nruta del adjunto");
const ruta = J.rutaStorageJustificacion("ABC123", "2026-09-30", "doc.PDF");
ok("ruta con curp y fecha", /^justificaciones\/ABC123\/2026-09-30-\d+\.pdf$/.test(ruta), `→ ${ruta}`);
const rutaSinExt = J.rutaStorageJustificacion("ABC123", "2026-09-30", "sin-ext");
ok("nombre sin punto: la 'extensión' es el nombre completo", /\.sin-ext$/.test(rutaSinExt), `→ ${rutaSinExt}`);
const rutaVacio = J.rutaStorageJustificacion("ABC123", "2026-09-30", "");
ok("nombre vacío → pdf por defecto", /\.pdf$/.test(rutaVacio));

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
