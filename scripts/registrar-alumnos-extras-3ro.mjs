// registrar-alumnos-extras-3ro.mjs
// Da de alta (si no existen) la identidad en ALUMNOS y asegura la inscripción
// ACTIVA en el grupo "3RO A RH" del ciclo OPERATIVO para los 2 alumnos que la
// lista de things no pudo emparejar por nombre (CURP proporcionado por el
// directivo). NO desactiva ninguna otra inscripción.
//
// Uso: node scripts/registrar-alumnos-extras-3ro.mjs [--apply]
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOT = path.join(import.meta.dirname, "..");
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
async function post(tabla, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok && r.status !== 201) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}
async function patch(tabla, id, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${tabla}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  return true;
}

const CLAVE_CURP = (curp) => String(curp).trim().toUpperCase().slice(-6);
const PENDIENTES = [
  { curp: "FOCA100513MDFLRLA0", pApellido: "FLORES", sApellido: "CERON", nombre: "ALIZON FATIMA" },
  { curp: "FIOK090228HGTGSVA3", pApellido: "FIGUEROA", sApellido: "OSORIO", nombre: "KEVIN ODICEO" },
];

async function main() {
  const periodos = await get("periodos", "id,nombre,activo,estado", "&limit=50");
  const op = periodos.find((p) => p.estado === "operativo" || p.activo === true);
  if (!op) throw new Error("No hay periodo operativo.");
  console.log(`${APPLY ? "APLICANDO" : "PLAN (dry-run)"} — periodo ${op.nombre}`);

  const carreras = await get("carreras", "id,clave", "&limit=100");
  const grupo = (await get("grupos", "id,grado,nombre,carrera_id,periodo_id", "&limit=2000"))
    .find((x) => x.grado === "3RO" && x.nombre === "A" && x.periodo_id === op.id &&
      (carreras.find((c) => c.id === x.carrera_id)?.clave ?? "") === "RH");
  if (!grupo) throw new Error("Grupo 3RO A RH no encontrado en el operativo.");
  console.log(`Grupo objetivo: 3RO A RH (${grupo.id})`);

  for (const al of PENDIENTES) {
    const curp = al.curp.trim().toUpperCase();
    const existente = await get("ALUMNOS", "CURP", `&CURP=eq.${curp}&limit=1`);
    if (existente.length === 0) {
      console.log(`  ALUMNO NUEVO ${curp}`);
      if (APPLY) {
        await post("ALUMNOS", {
          CURP: curp,
          CLAVE: CLAVE_CURP(curp),
          NOMBRE: al.nombre,
          P_APELLIDO: al.pApellido,
          S_APELLIDO: al.sApellido,
        });
        console.log(`    -> ALUMNOS creado (CLAVE=${CLAVE_CURP(curp)})`);
      }
    } else {
      console.log(`  ALUMNO YA EXISTE ${curp}`);
    }

    const filas = await get("inscripciones_alumno", "id,curp,activo", `&grupo_id=eq.${grupo.id}&curp=eq.${curp}&limit=5`);
    const fila = filas.find((f) => String(f.curp).trim().toUpperCase() === curp);
    if (fila && fila.activo === true) {
      console.log(`    inscripción YA ACTIVA en el grupo`);
    } else if (fila) {
      console.log(`    inscripción inactiva en el grupo -> reactivar`);
      if (APPLY) await patch("inscripciones_alumno", fila.id, { activo: true });
    } else {
      console.log(`    sin inscripción en el grupo -> insertar`);
      if (APPLY) await post("inscripciones_alumno", [{ curp, grupo_id: grupo.id, activo: true }]);
    }
  }

  if (!APPLY) console.log("\nModo plan: nada escrito. Re-ejecuta con --apply.");
  else console.log("\nEJECUTADO. Verifica con: node scripts/registrar-alumnos-extras-3ro.mjs (dry-run de nuevo)");
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
