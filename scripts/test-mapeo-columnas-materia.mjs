#!/usr/bin/env node
/**
 * PRUEBAS BLOQUE 7C — Mapeo explícito de columnas de calificaciones por materia.
 *
 * Transpila los módulos puros y verifica los casos obligatorios:
 *   Caso 1: ejemplo completo (identidad + CURP + actividades + parciales +
 *           promedio + oculta) → vista del alumno.
 *   Caso 2: sin configuración → 7B continúa funcionando igual.
 *   Casos 3-5: validación (columna inexistente, columna en dos categorías,
 *           sin nombre ni CURP).
 *   Caso 9: UPSERT por materia_id (función de persistencia).
 *   Casos 6-8, 10-14: integración/roles → validados con tsc, build y revisión
 *           manual (documentados al final).
 *
 * Uso: node scripts/test-mapeo-columnas-materia.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// 1) Transpilar módulos puros a CommonJS temporal
// ---------------------------------------------------------------------------
const tmp = path.join(__dirname, ".tmp-tests");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/columnas-calificaciones.ts", "columnas-calificaciones.js"],
  ["lib/escolar/mapeo-columnas-materia.ts", "mapeo-columnas-materia.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  ["lib/escolar/matriz-hoja.ts", "matriz-hoja.js"],
  ["lib/escolar/schema-tabla.ts", "schema-tabla.js"],
  ["lib/escolar/excel-a-registros.ts", "excel-a-registros.js"],
];

for (const [src, out] of archivos) {
  const ruta = path.join(root, src);
  const codigo = fs.readFileSync(ruta, "utf8");
  const { outputText } = ts.transpileModule(codigo, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: src,
  });
  fs.writeFileSync(path.join(tmp, out), outputText);
}

const mapeoCol = require(path.join(tmp, "mapeo-columnas-materia.js"));
const col = require(path.join(tmp, "columnas-calificaciones.js"));
const { matrizAFilasDirectas } = require(path.join(tmp, "excel-a-registros.js"));

// ---------------------------------------------------------------------------
// 2) Mini harness de aserciones
// ---------------------------------------------------------------------------
let pasos = 0;
let fallos = 0;

function ok(cond, nombre) {
  pasos++;
  if (cond) console.log(`  ✓ ${nombre}`);
  else {
    fallos++;
    console.error(`  ✗ ${nombre}`);
  }
}

function eq(real, esperado, nombre) {
  ok(real === esperado, `${nombre} → "${real}" (esperado "${esperado}")`);
}

function seccion(titulo) {
  console.log(`\n${titulo}`);
}

// ---------------------------------------------------------------------------
// Caso 1: ejemplo completo del BLOQUE 7C
// ---------------------------------------------------------------------------
seccion("Caso 1 · Ejemplo completo (identidad + CURP + actividades + parciales + promedio + oculta)");

const encabezadosArchivo = [
  "APELLIDO PATERNO",
  "APELLIDO MATERNO",
  "NOMBRE",
  "CURP",
  "ACTIVIDAD 1",
  "ACTIVIDAD 2",
  "TRABAJO",
  "P1",
  "P2",
  "PROM",
  "OBSERVACIONES",
];

const mapeo = {
  columnasNombreAlumno: ["APELLIDO PATERNO", "APELLIDO MATERNO", "NOMBRE"],
  columnaCurp: "CURP",
  columnasActividades: ["ACTIVIDAD 1", "ACTIVIDAD 2", "TRABAJO"],
  columnasParciales: ["P1", "P2"],
  columnaPromedio: "PROM",
  columnaFinal: null,
  columnasOcultas: ["OBSERVACIONES"],
};

const validacion1 = mapeoCol.validarMapeoColumnasMateria(mapeo, encabezadosArchivo);
ok(validacion1.ok, "Mapeo del ejemplo es válido contra los encabezados del archivo");

// Vista como la devuelve leerHojaDesdeTabla (columna fija "Alumno" primero).
const vistaReal = {
  encabezados: [
    "Alumno",
    "CURP",
    "ACTIVIDAD 1",
    "ACTIVIDAD 2",
    "TRABAJO",
    "P1",
    "P2",
    "PROM",
    "OBSERVACIONES",
  ],
  filas: [
    ["PEREZ LOPEZ JUAN", "CURP123", "9", "8", "10", "8.5", "9.2", "9.0", "OBS"],
  ],
};

const vAlumno = mapeoCol.aplicarMapeoAVista(vistaReal, mapeo, { rol: "alumno" });
eq(
  vAlumno.encabezados.join("|"),
  "Alumno|Actividad 1|Actividad 2|Actividad 3|Parcial 1|Parcial 2|Promedio",
  "Alumno: encabezados con mapeo explícito",
);
eq(
  vAlumno.filas[0].join("|"),
  "PEREZ LOPEZ JUAN|9|8|10|8.5|9.2|9.0",
  "Alumno: valores alineados con el nuevo orden",
);
ok(!vAlumno.encabezados.includes("CURP"), "Alumno: CURP no aparece");
ok(!vAlumno.encabezados.includes("OBSERVACIONES"), "Alumno: columna oculta no aparece");

// Identidad múltiple: vista con las 3 columnas físicas (formato legacy) →
// se fusionan en una sola columna "Alumno" con la concatenación en orden.
const vistaLegacy = {
  encabezados: encabezadosArchivo,
  filas: [["PEREZ", "LOPEZ", "JUAN", "CURP123", "9", "8", "10", "8.5", "9.2", "9.0", "OBS"]],
};
const vLegacy = mapeoCol.aplicarMapeoAVista(vistaLegacy, mapeo, { rol: "alumno" });
eq(vLegacy.encabezados[0], "Alumno", "Identidad múltiple → una sola columna 'Alumno'");
eq(vLegacy.filas[0][0], "PEREZ LOPEZ JUAN", "Identidad múltiple → concatenación en orden");

// Prellenado automático (el profesor solo corrige lo ambiguo).
const auto = mapeoCol.mapeoDesdeDeteccionAutomatica(encabezadosArchivo);
eq(
  auto.columnasNombreAlumno.join("|"),
  "APELLIDO PATERNO|APELLIDO MATERNO|NOMBRE",
  "Auto: identidad detectada",
);
eq(auto.columnaCurp, "CURP", "Auto: CURP detectada");
eq(
  auto.columnasActividades.join("|"),
  "ACTIVIDAD 1|ACTIVIDAD 2",
  "Auto: actividades detectadas",
);
eq(auto.columnasParciales.join("|"), "P1|P2", "Auto: parciales detectados");
eq(auto.columnaPromedio, "PROM", "Auto: promedio detectado");

// ---------------------------------------------------------------------------
// Caso 2: sin configuración → 7B continúa funcionando igual.
// ---------------------------------------------------------------------------
seccion("Caso 2 · Sin configuración, 7B funciona igual");

const vista7B = {
  encabezados: ["Alumno", "CURP", "ACT 1", "ACT 2", "P1", "P2", "PROMEDIO", "FIRMA", "OBSERVACIONES", "NO. CONTROL"],
  filas: [["JUAN PEREZ LOPEZ", "CURP-JUAN", "9", "8", "7", "8", "10", "X", "OBS", "12345"]],
};
const sinMapeo = col.vistaConColumnasIdentificadas(vista7B, { rol: "alumno" });
const conMapeoNull = col.vistaConColumnasIdentificadas(vista7B, { rol: "alumno", mapeo: null });
eq(
  sinMapeo.encabezados.join("|"),
  conMapeoNull.encabezados.join("|"),
  "Sin config: mapeo:null produce la misma vista que 7B",
);
eq(
  sinMapeo.encabezados.join("|"),
  "Alumno|Actividad 1|Actividad 2|Parcial 1|Parcial 2|Promedio",
  "Sin config: encabezados de 7B intactos",
);

// ---------------------------------------------------------------------------
// Casos 3-5: validación
// ---------------------------------------------------------------------------
seccion("3-5. Validación del mapeo");

const mapeoInexistente = {
  ...mapeo,
  columnasActividades: ["ACTIVIDAD 1", "COLUMNA INVENTADA"],
};
const v3 = mapeoCol.validarMapeoColumnasMateria(mapeoInexistente, encabezadosArchivo);
ok(!v3.ok, "Caso 3) Columna inexistente → rechazada");
ok(
  v3.ok === false && v3.errores.some((e) => e.includes("no existe")),
  "Caso 3) Mensaje claro de columna inexistente",
);

const mapeoDosCategorias = {
  ...mapeo,
  columnasParciales: ["P1", "P2", "TRABAJO"],
};
const v4 = mapeoCol.validarMapeoColumnasMateria(mapeoDosCategorias, encabezadosArchivo);
ok(!v4.ok, "Caso 4) Columna en dos categorías → rechazada");
ok(
  v4.ok === false &&
    v4.errores.some((e) => e.includes("asignada simultáneamente")),
  "Caso 4) Mensaje 'asignada simultáneamente'",
);

const mapeoSinIdentidad = {
  ...mapeo,
  columnasNombreAlumno: [],
  columnaCurp: null,
};
const v5 = mapeoCol.validarMapeoColumnasMateria(mapeoSinIdentidad, encabezadosArchivo);
ok(!v5.ok, "Caso 5) Sin nombre ni CURP → rechazado");
ok(
  v5.ok === false && v5.errores.some((e) => e.includes("al menos")),
  "Caso 5) Mensaje claro de identidad requerida",
);

// Estructura válida / inválida
ok(mapeoCol.esMapeoColumnasMateria(mapeo), "Mapeo bien formado → estructura válida");
ok(!mapeoCol.esMapeoColumnasMateria({ columnasActividades: "no-lista" }), "Mapeo mal formado → rechazado");

// ---------------------------------------------------------------------------
// 9) UPSERT por materia_id (la función de persistencia usa onConflict)
// ---------------------------------------------------------------------------
seccion("Caso 9 · UPSERT por materia_id");
const fuente = fs.readFileSync(path.join(root, "lib/escolar/mapeo-columnas-materia.ts"), "utf8");
ok(
  /onConflict:\s*"materia_id"/.test(fuente) &&
    /materias_mapeo_columnas_unico/.test(
      fs.readFileSync(
        path.join(root, "supabase/crear-tabla-mapeo-columnas-materias.sql"),
        "utf8",
      ),
    ),
  "Caso 9) Guardar/guardar/guardar → UPSERT (UNIQUE materia_id + onConflict)",
);

// ---------------------------------------------------------------------------
// BLOQUE 7C.1 — Robustez: físico vs normalizado vs etiqueta
// ---------------------------------------------------------------------------
seccion("7C.1 · Físico vs normalizado vs etiqueta");

// Test 1: mapeo con variante normalizada → resuelve al físico real.
const r1 = mapeoCol.resolverColumnaFisica("Calificación final", [
  "CALIFICACION FINAL",
]);
ok(
  r1.ok && r1.fisico === "CALIFICACION FINAL",
  "Test 1) Mapeo «Calificación final» → físico «CALIFICACION FINAL»",
);

// Test 2: caso inverso → conserva el físico con tilde.
const r2 = mapeoCol.resolverColumnaFisica("CALIFICACION FINAL", [
  "Calificación final",
]);
ok(
  r2.ok && r2.fisico === "Calificación final",
  "Test 2) Mapeo «CALIFICACION FINAL» → físico «Calificación final»",
);

// Test 3: config guardada con variante → la vista aplica categoría FINAL y
// conserva encabezadoOriginal (físico) + etiqueta amigable.
const vistaFinal = {
  encabezados: ["Alumno", "CALIFICACION FINAL"],
  filas: [["JUAN PEREZ", "9.0"]],
};
const mapeoFinal = {
  columnasNombreAlumno: [],
  columnaCurp: null,
  columnasActividades: [],
  columnasParciales: [],
  columnaPromedio: null,
  columnaFinal: "Calificación final",
  columnasOcultas: [],
};
const vFinal = mapeoCol.aplicarMapeoAVista(vistaFinal, mapeoFinal, {
  rol: "alumno",
});
const cFinal = vFinal.columnasIdentificadas.find(
  (c) => c.categoria === "final",
);
ok(Boolean(cFinal), "Test 3) Config con variante normalizada aplica categoría final");
ok(
  cFinal && cFinal.encabezadoOriginal === "CALIFICACION FINAL",
  "Test 3) encabezadoOriginal conserva el físico real",
);
ok(
  vFinal.encabezados.includes("Calificación final"),
  "Test 3) La etiqueta mostrada es amigable",
);

// Test 4: colisión semántica detectada; NO se fusiona ni elige arbitrariamente.
const colisiones = mapeoCol.detectarColisionesEncabezados([
  "CALIFICACION FINAL",
  "Calificación final",
]);
ok(colisiones.length === 1, "Test 4) Colisión semántica detectada");
// Referencia NO exacta (variante con tilde no presente físicamente) → ambigua.
const ambig = mapeoCol.resolverColumnaFisica("CALIFICACIÓN FINAL", [
  "CALIFICACION FINAL",
  "Calificación final",
]);
ok(!ambig.ok, "Test 4) Variante normalizada ambigua → rechazada (no elige arbitrariamente)");
// Referencia EXACTA a una de las columnas colisionadas → resuelve sin ambigüedad.
const exactaRef = mapeoCol.resolverColumnaFisica("Calificación final", [
  "CALIFICACION FINAL",
  "Calificación final",
]);
ok(
  exactaRef.ok && exactaRef.fisico === "Calificación final",
  "Test 4b) Referencia exacta a una columna colisionada SÍ resuelve",
);

// Test 5: matrizAFilasDirectas conserva el encabezado EXACTO (físico).
const r5 = matrizAFilasDirectas([
  ["NOMBRE", "Calificación final"],
  ["JUAN PEREZ", "9.0"],
]);
ok(
  r5.columnasSupabase.join("|") === "Calificación final",
  "Test 5) matrizAFilasDirectas conserva el encabezado EXACTO (con tilde)",
);
ok(
  Object.prototype.hasOwnProperty.call(r5.filas[0], "Calificación final"),
  "Test 5) Clave física exacta en el payload del INSERT",
);

// Test 5b: toggle por normalización evita duplicados por formato.
const tToggle1 = mapeoCol.toggleColumnaEnLista(["P. De partida\n10%"], "P. De partida 10%");
eq(
  tToggle1.join("|"),
  "P. De partida 10%",
  "Test 5b) Marcar variante → reemplaza (no duplica) con el encabezado actual",
);
const tToggle2 = mapeoCol.toggleColumnaEnLista(["Act 1"], "Act 1");
eq(tToggle2.join("|"), "", "Test 5b) Marcar la misma columna física → desmarca");
const tToggle3 = mapeoCol.toggleColumnaEnLista([], "Act 1");
eq(tToggle3.join("|"), "Act 1", "Test 5b) Marcar columna nueva → añade");

// ---------------------------------------------------------------------------
// 6) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// Casos de integración (roles + almacenamiento), validados con tsc, build y
// revisión manual:
//   Caso 6/7) Alumno/tutor NO pueden guardar → actionGuardarMapeoColumnasMateria
//             valida sesion.rol !== maestro/directivo (revisado en código).
//   Caso 8) Materia inexistente → se re-resuelve contra listarMateriasCompletas
//           y se rechaza (revisado en código).
//   Caso 10) Subir Excel → actionSubirMateriaExcel intacta (git diff).
//   Caso 11) Alumno ve solo su fila → actionObtenerVistaMateria (7B, intacto).
//   Caso 12) Alumno no ve CURP/ocultas → mapeo aplica categorías curp/auxiliar.
//   Caso 13/14) Profesor/directivo ven todo y pueden configurar (mismo
//           componente y roles permitidos).
//   Caso 15) supabase.from(nombreVisible) NO existe → verificado con búsqueda
//           en el repositorio (solo supabase.from(idInterno)).

// Limpieza del directorio temporal de transpilación
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);


