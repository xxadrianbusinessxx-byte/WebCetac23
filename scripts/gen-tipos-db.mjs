/**
 * gen-tipos-db.mjs — genera `lib/supabase/database.types.ts` desde el esquema REAL.
 *
 * QUÉ MIDE: el esquema tal y como está HOY en la base — tablas, columnas, enums y
 *           relaciones — leído con `supabase gen types typescript`.
 * QUÉ ESCRIBE: `lib/supabase/database.types.ts` (un archivo del repo). NO escribe
 *           en la base: solo hace SELECT contra el catálogo de PostgreSQL.
 * QUÉ LEE: **la red**. Es el único `gen-*` que no es `LEE(fs)`: necesita `DATABASE_URL`
 *           de `.env.local`, y por eso su fila en `scripts/README.md` no está entre
 *           los que corren sin credenciales.
 * CÓMO SE EJECUTA:
 *   node scripts/gen-tipos-db.mjs            # escribe el archivo
 *   node scripts/gen-tipos-db.mjs --check    # no escribe; sale 1 si el del repo difiere
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Hasta ahora cada columna del código estaba tipada a mano contra un esquema que vive
 * en otro sitio y que nadie comparaba con el código (`grep -rn "Database\[" lib` daba
 * cero). Con el tipo generado, confundir un uuid con un texto pasa a ser un error de
 * compilación en vez de una fila mal escrita en producción. El contrato de `--check`
 * es el mismo que el de `gen-matriz-permisos.mjs --check`: comparar contra la realidad
 * y fallar si divergen.
 *
 * ── La versión de la CLI va CLAVADA ────────────────────────────────────────
 * Y no es un detalle de estilo: `--check` compara la SALIDA de la CLI, así que si la
 * versión cambia y cambia el formato, el check falla en falso y nadie sabría por qué.
 * Subir esta constante es una decisión, con su regeneración y su diff a la vista.
 *
 * ── No hay staging ─────────────────────────────────────────────────────────
 * Lo que se lee es producción. Este script solo lee; tiene que seguir siendo verdad.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const DESTINO = path.join(root, "lib", "supabase", "database.types.ts");
const CLI = "supabase@2.117.0";
const soloComprobar = process.argv.includes("--check");

// ── Credenciales: de `.env.local`, como el resto de los scripts del repo ────
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const dbUrl = env.DATABASE_URL?.trim();
if (!dbUrl) {
  console.error("Falta DATABASE_URL en .env.local: sin ella no hay esquema que leer.");
  process.exit(1);
}

// ── La cabecera que hace imposible confundir esto con un archivo a mano ─────
const CABECERA = `// GENERADO POR \`node scripts/gen-tipos-db.mjs\` — NO EDITAR A MANO.
// Fuente: el esquema REAL del proyecto nnhjqqjonabchluuwmkp, leído con
// \`supabase gen types typescript --db-url\` (CLI ${CLI.split("@")[1]}).
// Regenerar: \`node scripts/gen-tipos-db.mjs\` · Comprobar: \`... --check\`.
// Editar esto a mano lo convierte en la segunda fuente que R6 prohíbe: si algo aquí no
// cuadra con lo que el código espera, el que está mal es el código o el esquema.
`;

let crudo;
try {
  crudo = execFileSync("npx", ["--yes", CLI, "gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  const err = `${e.stdout ?? ""}${e.stderr ?? ""}`.trim();
  console.error("La CLI de Supabase falló al leer el esquema:");
  console.error(err.split("\n").slice(0, 12).map((l) => `  ${l}`).join("\n"));
  process.exit(1);
}

// Normalizado a LF: el archivo del repo vive con CRLF en Windows (git lo convierte) y
// comparar sin normalizar daría desfase perpetuo.
const generado = `${CABECERA}${crudo.replace(/\r\n/g, "\n").replace(/^\n+/, "")}`;
const enDisco = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8").replace(/\r\n/g, "\n") : null;

const tablas = [...generado.matchAll(/^ {6}(\w+): \{$/gm)].length;
const lineas = generado.split("\n").length;

if (soloComprobar) {
  if (enDisco === null) {
    console.error("DESFASADO: lib/supabase/database.types.ts no existe. Corre `node scripts/gen-tipos-db.mjs`.");
    process.exit(1);
  }
  const desfasado = enDisco !== generado;
  console.log(desfasado ? "DESFASADO: el archivo del repo no coincide con el esquema real." : "Al día.");
  if (desfasado) {
    console.log(`  en disco: ${enDisco.split("\n").length} líneas · recién generado: ${lineas} líneas`);
    console.log("  Corre `node scripts/gen-tipos-db.mjs` y revisa el diff antes de commitear.");
  }
  process.exit(desfasado ? 1 : 0);
}

fs.writeFileSync(DESTINO, generado);
console.log(`lib/supabase/database.types.ts regenerado: ${tablas} tablas · ${lineas} líneas.`);
