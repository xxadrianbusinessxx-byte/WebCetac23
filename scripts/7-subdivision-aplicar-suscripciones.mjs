// 7-subdivision-aplicar-suscripciones.mjs — Actualiza las inscripciones
// (suscripciones académicas) de los alumnos en supabase:
//   inscripciones_alumno.curp → grupo_id (catálogo 2026-2027)
// Usa la misma semántica que `inscribirAlumno({ unaActiva: true })` del proyecto:
//   - desactiva la inscripción ACTIVA anterior si apunta a otro grupo,
//   - hace UPSERT (curp, grupo_id) con activo=true.
//
// DRY-RUN por defecto: imprime el plan sin modificar nada.
// Para aplicar de verdad:  node scripts/7-subdivision-aplicar-suscripciones.mjs --apply
import fs from "node:fs";
import path from "node:path";

const APPLY = process.argv.includes("--apply");
const root = path.join(import.meta.dirname, "..");

const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}
const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function request(method, pathApi, body) {
  const r = await fetch(`${urlBase}/rest/v1/${pathApi}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const texto = await r.text();
    throw new Error(`${method} ${pathApi} → ${r.status} ${texto}`);
  }
  return r;
}

function parseCsvCell(v) {
  return v.trim();
}

// 1) Leer reporte CSV (generado por 7-subdivision-reporte-curps.mjs)
const csv = fs.readFileSync(path.join(import.meta.dirname, "7-subdivision-reporte-curps.csv"), "utf8");
const lineas = csv.replace(/^\uFEFF/, "").split("\n").filter(Boolean);
const filas = [];
for (let i = 1; i < lineas.length; i++) {
  const p = lineas[i].split(",");
  filas.push({
    archivo: p[0],
    grado: p[1],
    grupo: p[2],
    carrera: p[3],
    grupoId: p[4],
    grupoExiste: p[5],
    estado: p[8],
    curp: p[9],
    excelNombre: p[6],
  });
}

// Solo los que tienen CURP y grupo destino existente.
const aProcesar = filas.filter(
  (f) => f.estado !== "SIN_MATCH" && f.curp && f.grupoId && f.grupoExiste === "SI",
);
const porEstado = {};
for (const f of aProcesar) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
console.log(`Modo: ${APPLY ? "APLICAR" : "DRY-RUN (sin cambios)"}`);
console.log(`Alumnos a inscribir: ${aProcesar.length}`, JSON.stringify(porEstado));

// 2) Inscripciones actuales activas
const curpsActivas = new Map(); // curp -> grupo_id
{
  let desde = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await fetch(
      `${urlBase}/rest/v1/inscripciones_alumno?select=curp,grupo_id,activo&order=curp&offset=${desde}&limit=${PAGE}`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const ins of data) {
      if (ins.activo) curpsActivas.set(ins.curp.toUpperCase(), ins.grupo_id);
    }
    if (data.length < PAGE) break;
    desde += PAGE;
  }
}

// 3) Plan
const plan = [];
for (const f of aProcesar) {
  const actualId = curpsActivas.get(f.curp.toUpperCase());
  const accion = actualId ? (actualId === f.grupoId ? "SIN_CAMBIO" : "CAMBIO_GRUPO") : "NUEVA_INSCRIPCION";
  plan.push({ ...f, accion, actualId });
}
const resumen = {};
for (const p of plan) resumen[p.accion] = (resumen[p.accion] ?? 0) + 1;
console.log("Plan:", JSON.stringify(resumen));

for (const p of plan) {
  if (p.accion === "SIN_CAMBIO") continue;
  const destino = `${p.grado} ${p.grupo}${p.carrera ? " " + p.carrera : ""}`;
  const linea = `[${p.archivo}] ${p.curp} → ${destino} (grupo_id=${p.grupoId})  [${p.estado}/${p.accion}] ${p.excelNombre}`;
  console.log(APPLY ? `  A ${linea}` : `  • ${linea}`);
}

// 4) Aplicar
if (APPLY) {
  let ok = 0;
  let err = 0;
  for (const p of plan) {
    if (p.accion === "SIN_CAMBIO") continue;
    try {
      if (p.accion === "CAMBIO_GRUPO") {
        // Desactivar inscripción activa que apunte a OTRO grupo (misma semántica que inscribirAlumno).
        const q = `inscripciones_alumno?curp=eq.${encodeURIComponent(p.curp)}&activo=eq.true&grupo_id=neq.${encodeURIComponent(p.grupoId)}`;
        await request("PATCH", q, { activo: false });
      }
      // UPSERT (curp, grupo_id) activo=true.
      await request(
        "POST",
        "inscripciones_alumno?on_conflict=curp,grupo_id",
        { curp: p.curp, grupo_id: p.grupoId, activo: true },
      );
      ok++;
    } catch (e) {
      err++;
      console.error("  ✘ ERROR:", p.curp, e.message);
    }
  }
  console.log(`\nAplicado: OK=${ok} · ERROR=${err}`);
} else {
  console.log("\n(No se modificó nada. Usa --apply para aplicar.)");
}
