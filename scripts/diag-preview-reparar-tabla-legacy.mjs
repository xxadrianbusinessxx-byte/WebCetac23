// diag-preview-reparar-tabla-legacy.mjs — DIAGNÓSTICO (SOLO LECTURA)
// Simula planRepararTablaLegacy() contra los datos REALES para saber, ANTES de
// pulsar el botón del directivo, cuántas filas quedarían en
// match / ya_tiene / sin_origen / ambiguo.
// Replica la identidad de grupo: grado|grupo|carrera + materia_id.
// NO escribe absolutamente nada.
//
// Uso: node scripts/diag-preview-reparar-tabla-legacy.mjs [ORIGEN] [DESTINO]
//   por defecto: ORIGEN="2026-2027"  DESTINO=<periodo operativo>
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
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
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function get(tabla, select, extra = "") {
  const r = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} → ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// Mismos normalizadores que lib/escolar/catalogo-academico.ts
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
const identidad = (g) => `${norm(g.grado)}|${norm(g.nombre)}|${norm(g.carreraClave)}`;

async function main() {
  const argOrigen = process.argv[2] ?? "2026-2027";
  const periodos = await get("periodos", "id,nombre,activo", "&limit=50");
  const destino = process.argv[3]
    ? periodos.find((p) => p.nombre === process.argv[3])
    : periodos.find((p) => p.activo === true);
  const origen = periodos.find((p) => p.nombre === argOrigen);
  if (!destino) throw new Error("No hay periodo destino (¿ninguno activo?).");
  if (!origen) throw new Error(`No existe el periodo origen "${argOrigen}".`);

  console.log(`ORIGEN : ${origen.nombre}  [${origen.id.slice(0, 8)}]`);
  console.log(`DESTINO: ${destino.nombre}  [${destino.id.slice(0, 8)}]  ${destino.activo ? "(OPERATIVO)" : ""}\n`);

  const carreras = await get("carreras", "id,clave", "&limit=200");
  const claveCarrera = new Map(carreras.map((c) => [c.id, c.clave]));
  const conCarrera = (g) => ({
    id: g.id,
    grado: g.grado,
    nombre: g.nombre,
    carreraClave: g.carrera_id ? (claveCarrera.get(g.carrera_id) ?? "") : "",
  });

  const gDest = (await get("grupos", "id,grado,nombre,carrera_id,periodo_id", `&periodo_id=eq.${destino.id}&limit=500`)).map(conCarrera);
  const gOrig = (await get("grupos", "id,grado,nombre,carrera_id,periodo_id", `&periodo_id=eq.${origen.id}&limit=500`)).map(conCarrera);

  const leerGm = async (grupos) => {
    if (!grupos.length) return [];
    const ids = grupos.map((g) => g.id);
    return get("grupo_materias", "id,grupo_id,materia_id,tabla_legacy,activo", `&grupo_id=in.(${ids.join(",")})&activo=is.true&limit=20000`);
  };
  const gmDest = await leerGm(gDest);
  const gmOrig = await leerGm(gOrig);

  // Índices, igual que planRepararTablaLegacy
  const identidadDestPorId = new Map(gDest.map((g) => [g.id, identidad(g)]));
  const origenPorIdentidad = new Map();
  for (const g of gOrig) if (!origenPorIdentidad.has(identidad(g))) origenPorIdentidad.set(identidad(g), g);

  const candidatos = new Map();
  for (const gm of gmOrig) {
    const valor = (gm.tabla_legacy ?? "").trim();
    if (!valor) continue;
    let porMateria = candidatos.get(gm.grupo_id);
    if (!porMateria) { porMateria = new Map(); candidatos.set(gm.grupo_id, porMateria); }
    const set = porMateria.get(gm.materia_id) ?? new Set();
    set.add(valor);
    porMateria.set(gm.materia_id, set);
  }

  const conteo = { match: 0, ya_tiene: 0, sin_origen: 0, ambiguo: 0 };
  const detalles = { sin_origen: [], ambiguo: [] };
  const ejemplos = [];
  for (const gm of gmDest) {
    if ((gm.tabla_legacy ?? "").trim() !== "") { conteo.ya_tiene++; continue; }
    const ident = identidadDestPorId.get(gm.grupo_id);
    const go = ident ? origenPorIdentidad.get(ident) : null;
    if (!go) { conteo.sin_origen++; detalles.sin_origen.push(`${ident} (sin grupo equivalente)`); continue; }
    const set = candidatos.get(go.id)?.get(gm.materia_id);
    if (!set || set.size === 0) { conteo.sin_origen++; detalles.sin_origen.push(`${ident} materia=${String(gm.materia_id).slice(0, 8)} (sin tabla_legacy en origen)`); continue; }
    if (set.size > 1) { conteo.ambiguo++; detalles.ambiguo.push(`${ident} → ${[...set].join(" | ")}`); continue; }
    conteo.match++;
    if (ejemplos.length < 8) ejemplos.push(`${ident}  →  ${[...set][0]}`);
  }

  console.log("=== RESULTADO SIMULADO DEL PREVIEW ===");
  console.log(`  match      : ${conteo.match}   <-- filas que se repararían`);
  console.log(`  ya_tiene   : ${conteo.ya_tiene}`);
  console.log(`  sin_origen : ${conteo.sin_origen}`);
  console.log(`  ambiguo    : ${conteo.ambiguo}`);
  console.log(`  TOTAL destino (gm activas): ${gmDest.length}`);

  if (ejemplos.length) {
    console.log("\n=== EJEMPLOS DE MATCH ===");
    for (const e of ejemplos) console.log(`  ${e}`);
  }
  for (const k of ["sin_origen", "ambiguo"]) {
    if (detalles[k].length) {
      console.log(`\n=== ${k.toUpperCase()} (primeros 10 de ${detalles[k].length}) ===`);
      for (const d of detalles[k].slice(0, 10)) console.log(`  ${d}`);
    }
  }

  console.log(
    conteo.match === gmDest.length
      ? "\n✅ VEREDICTO: reparación completa y sin ambigüedad. Seguro aplicar."
      : conteo.ambiguo > 0
        ? "\n⚠️  VEREDICTO: hay ambigüedad. Revisar antes de aplicar."
        : "\n⚠️  VEREDICTO: reparación PARCIAL. Revisar los sin_origen.",
  );
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
