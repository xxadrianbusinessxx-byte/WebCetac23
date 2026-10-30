// diag-pendientes-administracion.mjs — DIAGNÓSTICO (SOLO LECTURA) — PROMPT AB.
//
// Mide lo que pinta el panel «Datos incompletos» de Administración escolar:
//   - roster activo del ciclo operativo (por periodos.id);
//   - alumnos con la marca «Pendiente de administración» y, de ellos, cuántos
//     no tienen inscripción activa en el ciclo operativo;
//   - el resumen por campo con la MISMA decisión que usa el panel
//     (lib/escolar/alumno/datos-incompletos-puro.ts), sin copiarla.
// Solo GET por REST. Imprime CONTEOS: ni CURP, ni claves, ni nombres.
// Lee .env.local igual que scripts/diag-alta-manual-alumno.mjs.
import fs from "node:fs";
import path from "node:path";

const {
  curpsARevisar,
  debeListarse,
  faltantesDeAlumno,
  notasDePendientes,
  resumenDatosIncompletos,
} = await import("../lib/escolar/alumno/datos-incompletos-puro.ts");

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
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${tabla} -> ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function main() {
  const periodos = await get("periodos", "id,nombre,estado", "&limit=50");
  const operativos = periodos.filter((p) => String(p.estado ?? "").toLowerCase() === "operativo");
  if (operativos.length !== 1) throw new Error(`periodos operativos: ${operativos.length} (se espera 1)`);
  const operativo = operativos[0];

  const inscripciones = await get("inscripciones_alumno", "curp,grupos(periodo_id)", "&activo=eq.true&limit=5000");
  const roster = new Set();
  for (const f of inscripciones) {
    const g = Array.isArray(f.grupos) ? f.grupos[0] : f.grupos;
    if (g && String(g.periodo_id) === String(operativo.id)) roster.add(String(f.curp).trim().toUpperCase());
  }

  const etiquetas = await get("alumno_etiquetas", "curp,titulo,valor", "&limit=10000");
  const notas = notasDePendientes(etiquetas);
  const marcadosSinGrupo = [...notas.keys()].filter((c) => !roster.has(c)).length;

  const curps = curpsARevisar([...roster], notas.keys());
  const lista = [];
  for (let i = 0; i < curps.length; i += 100) {
    const lote = curps.slice(i, i + 100);
    const filas = await get(
      "ALUMNOS",
      "CURP,NOMBRE,P_APELLIDO,S_APELLIDO,numero_control",
      `&CURP=in.(${lote.map(encodeURIComponent).join(",")})`,
    );
    for (const f of filas) {
      const curp = String(f.CURP).trim().toUpperCase();
      const faltantes = faltantesDeAlumno({
        curp,
        nombre: f.NOMBRE,
        pApellido: f.P_APELLIDO,
        sApellido: f.S_APELLIDO,
        numeroControl: f.numero_control ?? null,
        tieneGrupo: roster.has(curp),
      });
      const nota = notas.get(curp) ?? null;
      if (debeListarse(faltantes, nota)) lista.push({ curp, nombre: "", grupo: null, faltantes, nota });
    }
  }
  const r = resumenDatosIncompletos(curps.length, lista);

  console.log("=== PENDIENTES DE ADMINISTRACIÓN — MEDICIÓN ===");
  console.log(`periodo operativo                 ${operativo.nombre}`);
  console.log(`roster activo del operativo       ${roster.size}`);
  console.log(`marcados (etiqueta)               ${notas.size}`);
  console.log(`marcados sin grupo en el operativo ${marcadosSinGrupo}`);
  console.log(`revisados (roster ∪ marcados)     ${r.revisados}`);
  console.log(`incompletos · por confirmar       ${r.incompletos} · ${r.porConfirmar}`);
  console.log(
    `por campo                         curp ${r.porCampo.curp} · nombre ${r.porCampo.nombre} · grupo ${r.porCampo.grupo} · numero_control ${r.porCampo.numero_control}`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
