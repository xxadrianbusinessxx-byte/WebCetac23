// quitar-3ro-extras.mjs
// Verifica que 2 alumnos (detectados como "extras" en 3RO A RH) sí aparezcan en
// la lista 5TORHA.xlsx y, en ese caso, DESACTIVA su inscripción en 3RO A RH
// (activo=false; sin DELETE) dejándolos solo en su grupo oficial (5TO A RH).
//
// Uso: node scripts/quitar-3ro-extras.mjs [--apply]
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const APPLY = process.argv.includes("--apply");
const ROOT = path.join(import.meta.dirname, "..");
const LISTA_5TO = "C:/Users/URINDOWS/Desktop/web/things/Alumnos CETAC/5TORHA.xlsx";
const raw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
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
const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function get(tabla, select, extra = "") {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, { headers: H });
  const d = await r.json();
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${JSON.stringify(d).slice(0, 200)}`);
  return d;
}
async function patch(tabla, id, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}
function norm(s) {
  return String(s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-ZÑ0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

const EXTRAS = [
  { curp: "AAGC080710HVZLRRA6" },
  { curp: "AEBO090317HMCRLSA5" },
];

function nombresDeLista(file) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const out = new Set();
  for (const fila of rows.slice(1)) {
    if (!fila || fila.every((c) => c == null || String(c).trim() === "")) continue;
    const n = norm(fila[0]);
    if (n) out.add(n);
  }
  return out;
}

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const op = periodos.find((p) => p.estado === "operativo" || p.activo === true);
  const carreras = await get("carreras", "id,clave", "&limit=100");
  const grupos = await get("grupos", "id,grado,nombre,carrera_id,periodo_id", "&limit=2000");
  const grupo3ro = grupos.find((g) => g.grado === "3RO" && g.nombre === "A" && g.periodo_id === op.id &&
    (carreras.find((c) => c.id === g.carrera_id)?.clave ?? "") === "RH");
  const grupo5to = grupos.find((g) => g.grado === "5TO" && g.nombre === "A" && g.periodo_id === op.id &&
    (carreras.find((c) => c.id === g.carrera_id)?.clave ?? "") === "RH");
  if (!grupo3ro || !grupo5to) throw new Error("Grupos 3RO A RH / 5TO A RH no encontrados.");
  console.log(`${APPLY ? "APLICANDO" : "PLAN (dry-run)"} — ${op.nombre}`);
  console.log(`3RO A RH=${grupo3ro.id} | 5TO A RH=${grupo5to.id}`);

  const lista5to = nombresDeLista(LISTA_5TO);
  const alumnos = await get("ALUMNOS", "CURP,NOMBRE,P_APELLIDO,S_APELLIDO",
    `&CURP=in.(${EXTRAS.map((e) => e.curp).join(",")})&limit=10`);
  const alPorCurp = new Map(alumnos.map((a) => [String(a.CURP).trim().toUpperCase(), a]));

  for (const e of EXTRAS) {
    const a = alPorCurp.get(e.curp);
    const nombre = norm([a?.P_APELLIDO, a?.S_APELLIDO, a?.NOMBRE].filter(Boolean).join(" "));
    const en5to = Boolean(nombre && lista5to.has(nombre));
    console.log(`\n${e.curp}  ${[a?.P_APELLIDO, a?.S_APELLIDO, a?.NOMBRE].filter(Boolean).join(" ") ?? "(sin ALUMNOS)"}`);
    console.log(`  ¿Aparece en 5TORHA.xlsx? ${en5to ? "SÍ" : "NO"}`);
    if (!en5to) continue;

    const fila3ro = (await get("inscripciones_alumno", "id,curp,activo", `&grupo_id=eq.${grupo3ro.id}&curp=eq.${e.curp}&limit=5`))
      .find((f) => String(f.curp).trim().toUpperCase() === e.curp);
    const fila5to = (await get("inscripciones_alumno", "id,curp,activo", `&grupo_id=eq.${grupo5to.id}&curp=eq.${e.curp}&limit=5`))
      .find((f) => String(f.curp).trim().toUpperCase() === e.curp);

    if (fila3ro && fila3ro.activo === true) {
      console.log(`  3RO A RH: ACTIVA -> ${APPLY ? "desactivando…" : "se desactivaría (activo=false)"}`);
      if (APPLY) { await patch("inscripciones_alumno", fila3ro.id, { activo: false }); console.log("    -> desactivada"); }
    } else {
      console.log(`  3RO A RH: ${fila3ro ? "ya inactiva" : "sin fila"} (nada que hacer)`);
    }
    console.log(`  5TO A RH: ${fila5to && fila5to.activo === true ? "ACTIVA (se conserva)" : fila5to ? "inactiva" : "sin fila"}`);
  }
  if (!APPLY) console.log("\nModo plan: nada escrito. Re-ejecuta con --apply.");
  else console.log("\nEJECUTADO. Verifica con el dry-run de nuevo.");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
