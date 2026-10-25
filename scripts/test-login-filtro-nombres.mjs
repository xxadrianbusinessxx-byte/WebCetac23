/**
 * test-login-filtro-nombres.mjs — el filtro del login nunca deja fuera a un alumno.
 *
 * QUE PRUEBA: `patronFiltroNombre` de `lib/escolar/nombres.ts` (modulo puro), que
 * usa `buscarAlumnoPorNombre` (PROMPT Y, C-1) para pedir a la base solo las filas
 * candidatas en lugar de ALUMNOS entero. La propiedad que importa: toda fila que el
 * emparejamiento de siempre aceptaria (`nombresCoinciden` o subcadena normalizada)
 * tiene al menos una columna que casa con el patron ILIKE. Se comprueba con nombres
 * con acentos y Ñ, guardados en NFC y en NFD, y textos sin acentos, en otro orden,
 * en minusculas, con espacios de mas o cortados a media palabra.
 *
 * QUE ESCRIBE: nada. Solo lee del filesystem.
 *
 * Uso:
 *   node scripts/test-login-filtro-nombres.mjs
 */

const N = await import("../lib/escolar/nombres.ts");

let pasadas = 0;
let fallidas = 0;
function ok(titulo, condicion, detalle = "") {
  if (condicion) {
    pasadas++;
    console.log(`ok  ${titulo}`);
  } else {
    fallidas++;
    console.log(`FALLA  ${titulo}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

/** ILIKE de Postgres sobre un valor: % = cualquier secuencia, _ = un caracter. */
function ilike(valor, patron) {
  const re = patron
    .split("")
    .map((c) => (c === "%" ? "[\\s\\S]*" : c === "_" ? "[\\s\\S]" : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${re}$`, "i").test(valor);
}
const completo = (f) => [f.NOMBRE, f.P_APELLIDO, f.S_APELLIDO].filter(Boolean).join(" ").trim();
/** Lo que acepta hoy `buscarAlumnoPorNombre` (las dos vueltas). */
const aceptaHoy = (f, q) =>
  N.nombresCoinciden(completo(f), q) || N.normalizarNombre(completo(f)).includes(N.normalizarNombre(q));
/** Lo que trae la base con el filtro (sin patron: todo). */
const traeFiltro = (f, q) => {
  const p = N.patronFiltroNombre(q);
  return p === null || ["NOMBRE", "P_APELLIDO", "S_APELLIDO"].some((c) => ilike(f[c] ?? "", p));
};

// --- forma del patron -------------------------------------------------------
ok("elige el tramo con mas letras fijas y comodines en las acentuables", N.patronFiltroNombre("Trejo Zárate Adrián") === "%TR%J%", N.patronFiltroNombre("Trejo Zárate Adrián"));
ok("sin acentos da lo mismo que con acentos", N.patronFiltroNombre("TREJO ZARATE ADRIAN") === N.patronFiltroNombre("Trejo Zárate Adrián"));
ok("la Ñ y la N dan el mismo patron", N.patronFiltroNombre("Muñoz") === N.patronFiltroNombre("Munoz"), N.patronFiltroNombre("Muñoz"));
ok("texto vacio o solo vocales: null (no se filtra)", N.patronFiltroNombre("") === null && N.patronFiltroNombre("  ") === null && N.patronFiltroNombre("Ana Eva") === null);
ok("una sola letra fija no basta: null", N.patronFiltroNombre("Ian") === null);
ok("el patron solo lleva A-Z, 0-9 y % (no rompe la sintaxis or() de PostgREST)", /^[A-Z0-9%]+$/.test(N.patronFiltroNombre("O'Brian, Pérez (hijo)") ?? ""), N.patronFiltroNombre("O'Brian, Pérez (hijo)"));
ok("un usuario de tutor con punto se parte por tramos", N.patronFiltroNombre("juan.perez") === "%P%R%Z%", N.patronFiltroNombre("juan.perez"));

// --- la propiedad: superconjunto --------------------------------------------
const FILAS = [
  { NOMBRE: "Adrián Uriel", P_APELLIDO: "Trejo", S_APELLIDO: "Zárate" },
  { NOMBRE: "María José", P_APELLIDO: "Muñoz", S_APELLIDO: "Peña" },
  { NOMBRE: "JOSÉ ÁNGEL", P_APELLIDO: "GARCÍA", S_APELLIDO: "NÚÑEZ" },
  { NOMBRE: "Luis", P_APELLIDO: "De La Cruz", S_APELLIDO: "Ibáñez" },
  { NOMBRE: "Ximena", P_APELLIDO: "Hernández", S_APELLIDO: "" },
  { NOMBRE: "Renée", P_APELLIDO: "O'Connor", S_APELLIDO: "Güemes" },
];
const conNfd = FILAS.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.normalize("NFD")])));
const sinAcentos = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
function textosDe(f) {
  const n = completo(f);
  const t = n.split(/\s+/);
  return [
    n,
    sinAcentos(n).toUpperCase(),
    n.toLowerCase(),
    [...t].reverse().join(" "),
    `  ${t.join("   ")}  `,
    t.slice(0, 2).join(" "),
    t.slice(1).join(" "),
    `${t[0].slice(1)} ${t[1] ?? ""}`.trim(),
    `${(t.at(-2) ?? "").slice(2)} ${(t.at(-1) ?? "").slice(0, 3)}`.trim(),
    sinAcentos(t.at(-1) ?? ""),
  ].filter((x) => x.trim());
}
let casos = 0;
let fallos = [];
for (const fila of [...FILAS, ...conNfd]) {
  for (const q of textosDe(fila)) {
    if (!aceptaHoy(fila, q)) continue;
    casos++;
    if (!traeFiltro(fila, q)) fallos.push(`${JSON.stringify(q)} → ${N.patronFiltroNombre(q)}`);
  }
}
ok(`superconjunto en ${casos} textos que hoy encuentran a su alumno (NFC y NFD)`, fallos.length === 0 && casos > 60, fallos.slice(0, 3).join(" · "));

// Fuzz determinista: nombres al azar con acentos y Ñ, y textos derivados.
let semilla = 20261024;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const SIL = ["ma", "ría", "jo", "sé", "ñe", "gar", "cí", "a", "lu", "is", "pé", "rez", "zá", "ra", "te", "on", "ce", "bu", "sú", "tre", "jo", "yá", "ño"];
const palabra = () => Array.from({ length: 2 + Math.floor(azar() * 3) }, () => SIL[Math.floor(azar() * SIL.length)]).join("");
const cap = (s) => s[0].toUpperCase() + s.slice(1);
casos = 0;
fallos = [];
for (let i = 0; i < 400; i++) {
  const f = { NOMBRE: cap(palabra()) + (azar() < 0.3 ? ` ${cap(palabra())}` : ""), P_APELLIDO: cap(palabra()), S_APELLIDO: azar() < 0.8 ? cap(palabra()) : "" };
  const fila = azar() < 0.5 ? f : Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.normalize("NFD")]));
  for (const q of textosDe(fila)) {
    if (!aceptaHoy(fila, q)) continue;
    casos++;
    if (!traeFiltro(fila, q)) fallos.push(`${JSON.stringify(q)} vs ${JSON.stringify(completo(fila))}`);
  }
}
ok(`superconjunto en ${casos} textos de 400 nombres al azar`, fallos.length === 0 && casos > 1500, fallos.slice(0, 3).join(" · "));

// --- y filtra de verdad -----------------------------------------------------
const otros = FILAS.filter((f) => !traeFiltro(f, "Trejo Zárate Adrián")).length;
ok("con un nombre concreto deja fuera a los demas", otros === FILAS.length - 1, `fuera: ${otros}`);

// --- el supuesto, escrito ---------------------------------------------------
// Una letra con una marca que no es acento español (Š) y que el texto escribe sin
// ella no entra en el superconjunto. Los datos de hoy no la tienen (medido el
// 2026-10-24); si un dia aparece, esta comprobacion explica por que se pierde.
const filaŠ = { NOMBRE: "Ana", P_APELLIDO: "Štrb", S_APELLIDO: "" };
ok(
  "supuesto documentado: una Š guardada y escrita como S queda fuera",
  aceptaHoy(filaŠ, "Ana Strb") && !traeFiltro(filaŠ, "Ana Strb"),
);

console.log(`\nResultado: ${pasadas} pasadas, ${fallidas} fallidas`);
process.exit(fallidas ? 1 : 0);
