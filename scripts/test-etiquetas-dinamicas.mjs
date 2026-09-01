#!/usr/bin/env node
/**
 * PRUEBAS FASE 2 · PASO 3 — Módulo etiquetas dinámicas (capa pura).
 *
 * Transpila los módulos puros y verifica los casos obligatorios:
 *   · Límite de etiquetas: 0 → válido; 1 → válido; 20 → válido; 21 → inválido.
 *   · Duplicados por normalización: "Deporte", " deporte ", "DEPORTE",
 *     "Déporte" y "METÁ"/"META" deben considerarse el mismo título.
 *   · Validación de campo: orden negativo → inválido; título vacío → inválido;
 *     CURP vacío → inválido; valor vacío → válido.
 *   · Helpers: normalizarTituloPresentado, normalizarValorEtiqueta,
 *     excedeLimiteEtiquetas, ordenarEtiquetas.
 *
 * La capa de servicio (I/O con Supabase) no se prueba aquí: se valida con
 * tsc/eslint y revisión manual (mismo criterio que los tests del proyecto).
 *
 * Uso: node scripts/test-etiquetas-dinamicas.mjs
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
const tmp = path.join(__dirname, ".tmp-tests-etiquetas");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const archivos = [
  ["lib/escolar/nombres.ts", "nombres.js"],
  ["lib/escolar/tables.ts", "tables.js"],
  ["lib/escolar/buscar-en-filas.ts", "buscar-en-filas.js"],
  ["lib/escolar/etiquetas-dinamicas.ts", "etiquetas-dinamicas.js"],
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

const e = require(path.join(tmp, "etiquetas-dinamicas.js"));

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
// 3) Límite de 20 etiquetas
// ---------------------------------------------------------------------------
seccion("Límite de etiquetas (0 / 1 / 20 / 21)");

ok(e.validarConjuntoEtiquetas([]).ok, "0 etiquetas → válido");
ok(
  e.validarConjuntoEtiquetas([{ titulo: "Deporte", valor: "Fútbol" }]).ok,
  "1 etiqueta → válido",
);

const veinte = Array.from({ length: 20 }, (_, i) => ({
  titulo: `Etiqueta ${i + 1}`,
  valor: `Valor ${i + 1}`,
}));
ok(e.validarConjuntoEtiquetas(veinte).ok, "20 etiquetas → válido");

const veintiuna = Array.from({ length: 21 }, (_, i) => ({
  titulo: `Etiqueta ${i + 1}`,
  valor: `Valor ${i + 1}`,
}));
const r21 = e.validarConjuntoEtiquetas(veintiuna);
ok(!r21.ok, "21 etiquetas → inválido");
ok(
  !r21.ok && r21.errores.join(" ").includes("20"),
  "21 etiquetas → error de máximo 20",
);

eq(e.excedeLimiteEtiquetas(19, 1), false, "excedeLimiteEtiquetas(19, 1) → false");
eq(e.excedeLimiteEtiquetas(20, 1), true, "excedeLimiteEtiquetas(20, 1) → true");
eq(e.excedeLimiteEtiquetas(20, 0), false, "excedeLimiteEtiquetas(20, 0) → false");

// ---------------------------------------------------------------------------
// 4) Duplicados por normalización de título
// ---------------------------------------------------------------------------
seccion("Duplicados por normalización (Deporte / deporte / DEPORTE / Déporte)");

const normDeporte = "Deporte";
const normEspacios = " deporte ";
const normMayus = "DEPORTE";
const normAcento = "Déporte";

eq(
  e.normalizarTituloEtiqueta(normDeporte),
  e.normalizarTituloEtiqueta(normEspacios),
  "«Deporte» = « deporte » (espacios)",
);
eq(
  e.normalizarTituloEtiqueta(normDeporte),
  e.normalizarTituloEtiqueta(normMayus),
  "«Deporte» = «DEPORTE» (mayúsculas)",
);
eq(
  e.normalizarTituloEtiqueta(normDeporte),
  e.normalizarTituloEtiqueta(normAcento),
  "«Deporte» = «Déporte» (acento)",
);

ok(
  e.titulosEtiquetaCoinciden("METÁ", "META"),
  "«METÁ» = «META» (equivalencia sin acentos del servicio)",
);

const dup = e.validarConjuntoEtiquetas([
  { titulo: "Deporte", valor: "Fútbol" },
  { titulo: "DEPORTE", valor: "Fútbol" },
]);
ok(!dup.ok, "Conjunto con «Deporte» y «DEPORTE» → inválido (duplicado)");
ok(
  !dup.ok && dup.errores.join(" ").includes("duplicado"),
  "Mensaje de duplicado presente",
);

// El conjunto normalizado conserva el título presentado por el usuario.
const conEspacios = e.validarConjuntoEtiquetas([
  { titulo: "  Deporte  ", valor: "Fútbol" },
]);
ok(
  conEspacios.ok && conEspacios.etiquetas[0].titulo === "Deporte",
  "Título presentado → solo trim (conserva mayúsculas)",
);

// ---------------------------------------------------------------------------
// 5) Validación de campos
// ---------------------------------------------------------------------------
seccion("Validación de campos (orden / título / CURP / valor)");

ok(!e.validarOrdenEtiqueta(-1).ok, "Orden -1 → inválido");
ok(!e.validarOrdenEtiqueta(1.5).ok, "Orden 1.5 → inválido");
ok(e.validarOrdenEtiqueta(0).ok, "Orden 0 → válido");
ok(e.validarOrdenEtiqueta(19).ok, "Orden 19 → válido");
ok(!e.validarOrdenEtiqueta("2").ok, "Orden string «2» → inválido (debe ser número)");

ok(!e.validarEtiquetaNucleo({ titulo: "", valor: "x" }).ok, "Título vacío → inválido");
ok(!e.validarEtiquetaNucleo({ titulo: "   ", valor: "x" }).ok, "Título solo espacios → inválido");
ok(
  e.validarEtiquetaNucleo({ titulo: "Deporte", valor: "" }).ok,
  "Valor vacío → válido",
);
ok(
  e.validarEtiquetaNucleo({ titulo: "Deporte" }).ok,
  "Valor ausente → válido (se normaliza a '')",
);

eq(e.normalizarValorEtiqueta(123), "123", "Valor numérico 123 → «123»");
eq(e.normalizarValorEtiqueta(null), "", "Valor null → «»");
eq(e.normalizarValorEtiqueta(undefined), "", "Valor undefined → «»");

ok(!e.validarCurpEtiqueta("").ok, "CURP vacío → inválido");
ok(!e.validarCurpEtiqueta("   ").ok, "CURP solo espacios → inválido");
ok(!e.validarCurpEtiqueta(undefined).ok, "CURP undefined → inválido");
ok(
  e.validarCurpEtiqueta("  abc123  ").ok &&
    e.validarCurpEtiqueta("  abc123  ").curp === "ABC123",
  "CURP normalizado (trim + mayúsculas) → válido",
);

// ---------------------------------------------------------------------------
// 6) Helpers de orden
// ---------------------------------------------------------------------------
seccion("Orden y helpers de presentación");

const desordenadas = [
  { titulo: "Meta", valor: "Universidad", orden: 2 },
  { titulo: "Deporte", valor: "Fútbol", orden: 0 },
  { titulo: "Pasatiempo", valor: "Música", orden: 1 },
];
eq(
  e.ordenarEtiquetas(desordenadas).map((x) => x.titulo).join("|"),
  "Deporte|Pasatiempo|Meta",
  "ordenarEtiquetas ordena por `orden` ascendente",
);

eq(
  e.normalizarTituloPresentado("  Deporte  "),
  "Deporte",
  "normalizarTituloPresentado conserva mayúsculas y hace trim",
);

// ---------------------------------------------------------------------------
// 7) Resumen
// ---------------------------------------------------------------------------
console.log(`\n${pasos} verificaciones, ${fallos} fallos`);

// Casos de integración (servicio/I/O con Supabase), validados con tsc/eslint y
// revisión manual:
//   · guardarEtiquetaDinamica: con 19 existentes inserta; con 20 edita sin
//     consumir espacio; nuevo título con 20 → error de límite.
//   · guardarEtiquetasDinamicas: validación completa antes de escribir.
//   · eliminarEtiquetaDinamica: DELETE por id + curp.
//   · actualizarOrdenEtiquetasDinamicas: exige conjunto exacto del CURP.
//   · La BD mantiene el límite con el trigger `alumno_etiquetas_verificar_limite`.

// Limpieza del directorio temporal de transpilación
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* no crítico */
}

process.exit(fallos ? 1 : 0);

