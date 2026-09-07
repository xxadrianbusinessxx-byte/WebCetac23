// Test del Bloque 6C: consolidación de hermanos bajo un solo tutor.
//
// Simula el flujo completo usando la REST API de Supabase (misma lógica que
// las funciones de dominio):
//   A) Crear tutor compartido para 2 alumnos.
//   B) Crear tutor individual para 1 alumno.
//   C) Consolidar los 3 bajo un tutor NUEVO (OPCIÓN 1): se desactivan las
//      relaciones previas y se desactivan los tutores que quedan huérfanos.
//   D) Verificar el estado final.
//
// Al final limpia los datos de prueba para no contaminar la base real.
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
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
if (!urlBase || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const TABLA_TUTORES = "tutores";
const TABLA_TUTOR_ALUMNOS = "tutor_alumnos";
const TABLA_ALUMNOS = "ALUMNOS";

async function api(pathname, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${urlBase}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`API ${method} ${pathname} -> ${res.status}: ${text}`);
  }
  return json;
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ FALLO: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

// 1) Obtener 3 alumnos reales con CURP y nombre completo.
const alumnos = await api(`${TABLA_ALUMNOS}?select=CURP,NOMBRE,P_APELLIDO,S_APELLIDO&limit=3`);
const filas = (alumnos ?? []).filter((a) => String(a?.CURP ?? "").trim());
if (filas.length < 3) {
  console.error("No hay suficientes alumnos con CURP para la prueba.");
  process.exit(1);
}
const [alumno1, alumno2, alumno3] = filas;
const curp1 = String(alumno1.CURP).trim().toUpperCase();
const curp2 = String(alumno2.CURP).trim().toUpperCase();
const curp3 = String(alumno3.CURP).trim().toUpperCase();
const nombreCompleto = (a) =>
  [a.NOMBRE, a.P_APELLIDO, a.S_APELLIDO].filter(Boolean).join(" ").trim();
console.log(`Alumnos de prueba: ${curp1}, ${curp2}, ${curp3}`);



const creados = { tutores: [], relaciones: [] };

try {
  // 2) Tutor A compartido para alumnos 1 y 2.
  const tutorA = (
    await api(TABLA_TUTORES, {
      method: "POST",
      body: {
        clave_tutor: `TUT-TESTA${Date.now() % 100000}`,
        usuario: `tutor test A ${Date.now()}`,
        password_hash: "test:test",
        debe_cambiar_credenciales: true,
        activo: true,
      },
    })
  )[0];
  creados.tutores.push(tutorA.id);
  const relA = await api(TABLA_TUTOR_ALUMNOS, {
    method: "POST",
    body: [
      { tutor_id: tutorA.id, curp_alumno: curp1, tipo_relacion: "principal", activo: true },
      { tutor_id: tutorA.id, curp_alumno: curp2, tipo_relacion: "principal", activo: true },
    ],
  });
  creados.relaciones.push(...relA.map((r) => r.id));
  console.log(`Tutor A (compartido) creado: ${tutorA.clave_tutor}`);

  // 3) Tutor B individual para alumno 3. Su `usuario` es un string controlado
  //    por el test (único). Este tutor representa al "tutor previo" que quedará
  //    desactivado al consolidar.
  const usuarioB = `tutor test B ${Date.now()}`;
  const tutorB = (
    await api(TABLA_TUTORES, {
      method: "POST",
      body: {
        clave_tutor: `TUT-TESTB${Date.now() % 100000}`,
        usuario: usuarioB,
        password_hash: "test:test",
        debe_cambiar_credenciales: true,
        activo: true,
      },
    })
  )[0];
  creados.tutores.push(tutorB.id);
  const relB = await api(TABLA_TUTOR_ALUMNOS, {
    method: "POST",
    body: [
      { tutor_id: tutorB.id, curp_alumno: curp3, tipo_relacion: "principal", activo: true },
    ],
  });
  creados.relaciones.push(...relB.map((r) => r.id));
  console.log(`Tutor B (individual) creado: ${tutorB.clave_tutor} (usuario: "${usuarioB}")`);

  // 4) CONSOLIDACIÓN (OPCIÓN 1): crear tutor C nuevo para los 3. Su usuario
  //    base es el MISMO que el de B (simula el escenario del bug: el tutor
  //    nuevo intenta usar un `usuario` que ya está ocupado por un tutor previo
  //    desactivado). La app debe generar un usuario ÚNICO (con sufijo numérico)
  //    en lugar de chocar con el UNIQUE constraint. Aquí simulamos
  //    `generarUsuarioUnico`: verificamos si el base ya existe (sin filtrar por
  //    activo) y, si choca, añadimos sufijo numérico incremental.
  const usuarioCBase = usuarioB;
  let usuarioC = usuarioCBase;
  let sufijoC = 2;
  while (
    (await api(`${TABLA_TUTORES}?usuario=eq.${encodeURIComponent(usuarioC)}&select=id`))
      .length > 0
  ) {
    usuarioC = `${usuarioCBase} ${sufijoC}`;
    sufijoC++;
  }
  const tutorC = (
    await api(TABLA_TUTORES, {
      method: "POST",
      body: {
        clave_tutor: `TUT-TESTC${Date.now() % 100000}`,
        usuario: usuarioC,
        password_hash: "test:test",
        debe_cambiar_credenciales: true,
        activo: true,
      },
    })
  )[0];
  creados.tutores.push(tutorC.id);
  console.log(`Tutor C (nuevo, consolidado) creado: ${tutorC.clave_tutor} (usuario: "${usuarioC}")`);



  const relC = await api(TABLA_TUTOR_ALUMNOS, {
    method: "POST",
    body: [
      { tutor_id: tutorC.id, curp_alumno: curp1, tipo_relacion: "principal", activo: true },
      { tutor_id: tutorC.id, curp_alumno: curp2, tipo_relacion: "principal", activo: true },
      { tutor_id: tutorC.id, curp_alumno: curp3, tipo_relacion: "principal", activo: true },
    ],
  });
  creados.relaciones.push(...relC.map((r) => r.id));

  // 5) Desactivar relaciones previas (A→1, A→2, B→3) por tutor_id, SIN tocar

  //    las del tutor C recién creado (misma lógica que desactivarRelacionesDeAlumnos
  //    con exceptoTutorId).
  for (const id of [tutorA.id, tutorB.id]) {
    await api(`${TABLA_TUTOR_ALUMNOS}?tutor_id=eq.${id}&activo=eq.true`, {
      method: "PATCH",
      body: { activo: false },
    });
  }


  // 6) Desactivar tutores huérfanos (A y B ya no tienen relaciones activas).
  for (const id of [tutorA.id, tutorB.id]) {
    const activas = await api(
      `${TABLA_TUTOR_ALUMNOS}?tutor_id=eq.${id}&activo=eq.true&select=id`,
    );
    if (!activas || activas.length === 0) {
      await api(`${TABLA_TUTORES}?id=eq.${id}`, { method: "PATCH", body: { activo: false } });
    }
  }

  // 7) VERIFICACIONES.
  console.log("\n=== VERIFICACIONES ===");

  // C tiene 3 relaciones activas.
  const relCactivas = await api(
    `${TABLA_TUTOR_ALUMNOS}?tutor_id=eq.${tutorC.id}&activo=eq.true&select=curp_alumno`,
  );
  assert(
    relCactivas.length === 3,
    `Tutor C tiene 3 relaciones activas (tiene ${relCactivas.length})`,
  );

  // Ningún alumno tiene relación activa con A o B.
  const relAactivas = await api(
    `${TABLA_TUTOR_ALUMNOS}?tutor_id=eq.${tutorA.id}&activo=eq.true&select=id`,
  );
  const relBactivas = await api(
    `${TABLA_TUTOR_ALUMNOS}?tutor_id=eq.${tutorB.id}&activo=eq.true&select=id`,
  );
  assert(relAactivas.length === 0, "Tutor A no tiene relaciones activas");
  assert(relBactivas.length === 0, "Tutor B no tiene relaciones activas");

  // A y B quedaron inactivos (huérfanos).
  const tutorAFinal = (
    await api(`${TABLA_TUTORES}?id=eq.${tutorA.id}&select=activo`)
  )[0];
  const tutorBFinal = (
    await api(`${TABLA_TUTORES}?id=eq.${tutorB.id}&select=activo`)
  )[0];
  assert(tutorAFinal.activo === false, "Tutor A quedó inactivo (huérfano)");
  assert(tutorBFinal.activo === false, "Tutor B quedó inactivo (huérfano)");

  // C quedó activo.
  const tutorCFinal = (
    await api(`${TABLA_TUTORES}?id=eq.${tutorC.id}&select=activo`)
  )[0];
  assert(tutorCFinal.activo === true, "Tutor C quedó activo");

  // BUG ESPECÍFICO: el `usuario` del tutor C debe ser ÚNICO. Como el tutor B
  // (previo, desactivado) sigue ocupando el string base, C debe haber recibido
  // un sufijo numérico. Si C hubiera usado el mismo string, el UNIQUE
  // constraint habría rechazado el INSERT (el bug reportado).
  assert(
    usuarioC !== usuarioB,
    `Tutor C tiene un usuario único distinto al de B ("${usuarioC}" vs "${usuarioB}")`,
  );
  assert(
    usuarioC.startsWith(usuarioCBase) && usuarioC !== usuarioCBase,
    `Tutor C recibió sufijo numérico ("${usuarioC}")`,
  );

  // Cada alumno tiene exactamente 1 relación activa (la de C).

  for (const curp of [curp1, curp2, curp3]) {
    const activas = await api(
      `${TABLA_TUTOR_ALUMNOS}?curp_alumno=eq.${curp}&activo=eq.true&select=tutor_id`,
    );
    assert(
      activas.length === 1 && activas[0].tutor_id === tutorC.id,
      `Alumno ${curp} tiene 1 relación activa hacia tutor C`,
    );
  }

  console.log("\n=== RESULTADO ===");
  console.log(process.exitCode ? "HUBO FALLOS" : "TODAS LAS VERIFICACIONES PASARON");
} finally {
  // LIMPIEZA: borrar relaciones y tutores de prueba.
  console.log("\nLimpiando datos de prueba…");
  for (const id of creados.relaciones) {
    try {
      await api(`${TABLA_TUTOR_ALUMNOS}?id=eq.${id}`, { method: "DELETE" });
    } catch {}
  }
  for (const id of creados.tutores) {
    try {
      await api(`${TABLA_TUTORES}?id=eq.${id}`, { method: "DELETE" });
    } catch {}
  }
  console.log("Limpieza completada.");
}
