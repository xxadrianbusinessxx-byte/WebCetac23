#!/usr/bin/env node
/**
 * test-seleccion-url.mjs — suite de `lib/navegacion/seleccion-url.ts`, 2026-11-13.
 *
 * La regla que sostiene la función: **un enlace abre la pantalla que nombra,
 * y nada que el rol no tenga**. Si la validación se aflojara, un enlace con
 * `?pestana=` de otro rol dibujaría una pestaña inventada; si se apretara de más,
 * los enlaces de la presentación («Abrir en vivo») abrirían la portada.
 *
 * Reglas verificadas:
 *   1. Sin parámetros = el estado inicial de siempre (primera pestaña, primer
 *      apartado navegable, primer modo).
 *   2. Cada enlace del alumno que usa la presentación abre lo que nombra.
 *   3. Cada nivel inválido cae al inicial de SU nivel; una pestaña de otro rol
 *      se ignora entera.
 *   4. Un apartado apagado no se abre por enlace.
 *   5. Escribir la selección conserva `alumno` y los demás parámetros, y quita
 *      `modo` cuando no hay.
 *   6. Ida y vuelta: lo que se escribe se vuelve a leer igual.
 */
const S = await import("../lib/navegacion/seleccion-url.ts");
const nav = await import("../lib/navegacion/mapa-navegacion.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) {
    pasadas++;
    console.log(`  ok  ${nombre}`);
  } else {
    fallos++;
    console.error(`  FALLA ${nombre} ${detalle}`);
  }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

console.log("\n── 1. sin parámetros = el inicio de siempre ──\n");
{
  for (const rol of ["alumno", "tutor", "maestro", "directivo", "tecnico", "administracion", "servicio_escolar"]) {
    const primera = nav.pestanasDe(rol)[0];
    const inicial = nav.apartadoInicial(rol, primera.id);
    eq(
      S.seleccionDesdeParametros(rol, {}),
      { idPestana: primera.id, idApartado: inicial?.id ?? null, modo: inicial?.modos[0] ?? null },
      `${rol}: igual que el estado inicial del shell`,
    );
  }
  eq(S.seleccionDesdeParametros(null, { pestana: "perfil" }), { idPestana: "", idApartado: null, modo: null }, "sin rol: nada");
}

console.log("\n── 2. los enlaces del alumno de la presentación ──\n");
{
  const casos = [
    ["perfil", "notificaciones", "Justificaciones"],
    ["perfil", "informacion-personal", null],
    ["perfil", "seguimiento-semestral", null],
    ["perfil", "boleta", null],
    ["perfil", "seguimiento-medico", null],
    ["perfil", "sesiones-programadas", null],
    ["perfil", "constancias", null],
    ["materias", "calificacion", null],
    ["materias", "actividades", "Lista"],
    ["materias", "recursos", null],
    ["calendario", "calendario-escolar", null],
    ["calendario", "horario-escolar", null],
    ["calendario", "asistencia", null],
  ];
  for (const [pestana, apartado, modo] of casos) {
    const sel = S.seleccionDesdeParametros("alumno", { pestana, apartado, modo });
    eq([sel.idPestana, sel.idApartado], [pestana, apartado], `alumno abre ${pestana} › ${apartado}`);
    if (modo) eq(sel.modo, modo, `…en el modo «${modo}»`);
  }
}

console.log("\n── 3. lo inválido cae a su nivel ──\n");
{
  eq(
    S.seleccionDesdeParametros("alumno", { pestana: "calendario", apartado: "no-existe" }),
    { idPestana: "calendario", idApartado: "calendario-escolar", modo: null },
    "apartado inexistente → primer apartado de esa pestaña",
  );
  eq(
    S.seleccionDesdeParametros("alumno", { pestana: "perfil", apartado: "notificaciones", modo: "Inventado" }).modo,
    "Comentarios",
    "modo inexistente → primer modo del apartado",
  );
  eq(
    S.seleccionDesdeParametros("alumno", { pestana: "ciclo-escolar", apartado: "x" }),
    S.seleccionDesdeParametros("alumno", {}),
    "pestaña de otro rol (técnico) → portada del alumno, nada inventado",
  );
  eq(
    S.seleccionDesdeParametros("alumno", { pestana: "perfil", apartado: "constancias", modo: "Lista" }).modo,
    null,
    "un modo de otro apartado no se arrastra",
  );
}

console.log("\n── 4. un apartado apagado no se abre por enlace ──\n");
{
  let probado = false;
  for (const rol of ["alumno", "tutor", "maestro", "directivo", "tecnico", "administracion", "servicio_escolar"]) {
    for (const p of nav.pestanasDe(rol)) {
      for (const a of p.apartados) {
        if (nav.esNavegable(a)) continue;
        probado = true;
        const sel = S.seleccionDesdeParametros(rol, { pestana: p.id, apartado: a.id });
        ok(`${rol}: ${p.id} › ${a.id} (apagado) no se abre`, sel.idApartado !== a.id, JSON.stringify(sel));
      }
    }
  }
  if (!probado) ok("hoy no hay apartados apagados en el mapa (nada que probar)", true);
}

console.log("\n── 5. escribir conserva lo demás ──\n");
{
  const sel = { idPestana: "calendario", idApartado: "horario-escolar", modo: null };
  eq(
    S.busquedaConSeleccion("?alumno=AAAA000101HDFXXX01&modo=Viejo", sel),
    "alumno=AAAA000101HDFXXX01&pestana=calendario&apartado=horario-escolar",
    "conserva alumno, reemplaza la selección y quita el modo viejo",
  );
  eq(
    S.busquedaConSeleccion("", { idPestana: "perfil", idApartado: "notificaciones", modo: "Justificaciones" }),
    "pestana=perfil&apartado=notificaciones&modo=Justificaciones",
    "sin búsqueda previa escribe los tres",
  );
  eq(S.rutaPerfil({ idPestana: "", idApartado: null, modo: null }), "/perfil", "selección vacía → /perfil a secas");
  ok(
    S.rutaPerfil({ idPestana: "materias", idApartado: "actividades", modo: "Configuración de columnas" }).includes(
      "modo=Configuraci%C3%B3n+de+columnas",
    ),
    "un modo con acentos y espacios se codifica",
  );
}

console.log("\n── 6. ida y vuelta ──\n");
{
  for (const rol of ["alumno", "maestro", "administracion"]) {
    for (const p of nav.pestanasDe(rol)) {
      for (const a of p.apartados.filter(nav.esNavegable)) {
        for (const modo of a.modos.length ? a.modos : [null]) {
          const sel = { idPestana: p.id, idApartado: a.id, modo };
          const leida = S.seleccionDesdeParametros(
            rol,
            Object.fromEntries(new URLSearchParams(S.busquedaConSeleccion("", sel))),
          );
          if (JSON.stringify(leida) !== JSON.stringify(sel)) {
            ok(`${rol}: ${p.id} › ${a.id} › ${modo} vuelve igual`, false, JSON.stringify(leida));
          }
        }
      }
    }
    ok(`${rol}: toda selección navegable sobrevive a escribirse y leerse`, true);
  }
}

console.log(`\n${pasadas} ok · ${fallos} fallos`);
if (fallos > 0) process.exit(1);
