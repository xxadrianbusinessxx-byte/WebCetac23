// Migración (Bloque 6L): pobla `tutor_credenciales_iniciales` para los tutores
// EXISTENTES que aún no han cambiado sus credenciales (debe_cambiar_credenciales
// = true). Para cada tutor, inserta una fila por hijo activo con el hash scrypt
// de la contraseña inicial derivada de ESE hijo (últimos 8 del CURP).
//
// Esto permite que un tutor con 2+ hijos inicie sesión con los últimos 8 del
// CURP de CUALQUIERA de sus hijos, no solo del alumno de referencia.
//
// Uso: node scripts/migrar-credenciales-iniciales.mjs
// Es idempotente: si una fila (tutor_id, curp_alumno) ya existe, se omite.
import fs from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";

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

const TABLA_TUTORES = "tutores";
const TABLA_REL = "tutor_alumnos";
const TABLA_CRED = "tutor_credenciales_iniciales";

const SCRYPT_KEYLEN = 64;

/** Contraseña inicial = últimos 8 del CURP (misma regla que la app). */
function contraseñaInicialDesdeCurp(curp) {
  const c = String(curp ?? "").trim().toUpperCase();
  return c ? c.slice(-8) : "";
}

/** Hash scrypt con el MISMO formato que la app: "salt:hash" en base64url. */
function hashContraseña(contraseña) {
  const salt = randomBytes(16);
  const hash = scryptSync(contraseña, salt, SCRYPT_KEYLEN);
  return `${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

async function api(pathname, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const r = await fetch(`${urlBase}/rest/v1/${pathname}`, {
    ...rest,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
  });
  return r;
}

async function main() {
  console.log("=== Migración de credenciales iniciales (Bloque 6L) ===");

  // 1) Tutores activos que aún no han cambiado sus credenciales.
  const rTutores = await api(
    `${TABLA_TUTORES}?select=id,clave_tutor&debe_cambiar_credenciales=eq.true&activo=eq.true`,
  );
  if (!rTutores.ok) {
    console.error("Error al leer tutores:", rTutores.status, await rTutores.text());
    process.exit(1);
  }
  const tutores = await rTutores.json();
  console.log(`Tutores pendientes de cambiar credenciales: ${tutores.length}`);

  let insertadas = 0;
  let omitidas = 0;
  let errores = 0;

  for (const tutor of tutores) {
    // 2) CURP de los hijos activos de este tutor.
    const rRel = await api(
      `${TABLA_REL}?select=curp_alumno&tutor_id=eq.${tutor.id}&activo=eq.true`,
    );
    if (!rRel.ok) {
      console.error(`  [${tutor.clave_tutor}] error al leer relaciones:`, rRel.status);
      errores++;
      continue;
    }
    const rels = await rRel.json();
    const curps = [...new Set(rels.map((r) => String(r.curp_alumno ?? "").trim().toUpperCase()))].filter(Boolean);
    if (curps.length === 0) {
      console.log(`  [${tutor.clave_tutor}] sin hijos activos → omitido`);
      omitidas++;
      continue;
    }

    // 3) Insertar una fila por hijo (idempotente: se omite si ya existe).
    for (const curp of curps) {
      const contraseña = contraseñaInicialDesdeCurp(curp);
      if (!contraseña) continue;
      const fila = {
        tutor_id: tutor.id,
        curp_alumno: curp,
        password_hash: hashContraseña(contraseña),
      };
      const rIns = await api(TABLA_CRED, {
        method: "POST",
        body: JSON.stringify(fila),
        headers: { Prefer: "return=minimal" },
      });
      if (rIns.ok) {
        insertadas++;
      } else if (rIns.status === 409) {
        omitidas++; // ya existía (idempotente)
      } else {
        console.error(
          `  [${tutor.clave_tutor}] error al insertar ${curp}:`,
          rIns.status,
          await rIns.text(),
        );
        errores++;
      }
    }
  }

  console.log("=== Resumen ===");
  console.log(`Insertadas: ${insertadas}`);
  console.log(`Omitidas (sin hijos o ya existían): ${omitidas}`);
  console.log(`Errores: ${errores}`);
  console.log("Listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
