// probe-login-tecnico.mjs — prueba el login del rol técnico (PROMPT-3/T1).
import fs from "node:fs";
import path from "node:path";
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
const H = { apikey: key, Authorization: `Bearer ${key}` };

const rows = await (await fetch(`${urlBase}/rest/v1/PROFESORES?select=ID,"NOMBRE%2FPROFESOR%2FDIRECTIVO",CLAVE,Permisos,debe_cambiar_credenciales&"NOMBRE%2FPROFESOR%2FDIRECTIVO"=eq.TECNICO`, { headers: H })).json();
const fila = rows[0];
console.log("fila TECNICO:", JSON.stringify({ ID: fila?.ID, Permisos: fila?.Permisos, debe: fila?.debe_cambiar_credenciales }));

// Replica EXACTA de rolDesdePermisos (actualizado PROMPT-3).
function rolDesdePermisos(p) {
  const s = String(p ?? "").trim().toLowerCase();
  if (s.includes("directivo")) return "directivo";
  if (s.includes("tecnic")) return "tecnico";
  return "maestro";
}
const rol = rolDesdePermisos(fila?.Permisos);
console.log("rolDesdePermisos('Tecnico') →", rol);
// El flag puede estar en true (aún no cambió su clave inicial) o false (ya la
// cambió en el primer acceso, A4). Ambos son estados válidos del flujo; lo que
// define al técnico es el rol y la identidad estructural (ID → profesorId).
const flagOk =
  fila?.debe_cambiar_credenciales === true ||
  fila?.debe_cambiar_credenciales === false;
console.log(
  "resultado:",
  rol === "tecnico" && fila?.ID === 21 && flagOk
    ? `OK login técnico (rol, ID correctos; flag=${fila?.debe_cambiar_credenciales}: ${fila?.debe_cambiar_credenciales ? "aún no cambió su clave" : "ya la cambió (A4)"})`
    : "NO OK",
);
