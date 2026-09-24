#!/usr/bin/env node
/**
 * test-uis-pendientes.mjs — suites puras de las UIs pendientes.
 *
 * QUÉ MIDE: `administracion/flujos-puro` (máquinas de estado de citas,
 *           constancias, reportes y buzón), `materia/actividades-puro` (estado
 *           derivado y pesos), el agrupado en hilos de `mensajes-internos` y
 *           la constancia de estudios BETA de Administración escolar
 *           (`administracion/constancia-puro`, 2026-09-24).
 * QUÉ ESCRIBE: nada. Carga los `.ts` directamente. No toca la base.
 * CÓMO SE EJECUTA: node scripts/test-uis-pendientes.mjs
 *
 * ── Por qué estas tres y no las otras ──────────────────────────────────────
 * Son las decisiones que se pueden probar SIN base de datos, que es lo que
 * ORDEN.md §3 exige que viva en un módulo puro. Lo que hay alrededor —insertar
 * una fila, leerla— no se prueba aquí: eso necesita Supabase y no hay staging.
 */
// Node carga los `.ts` de lib/ directamente (PROMPT H-bis): sin transpilar a CommonJS.
// `mensajes-internos.ts` no es `-puro`, pero su único import es de tipos
// (`SupabaseClient`), que Node borra al cargar: sus funciones de agrupado se
// prueban sin tocar la base.
const F = await import("../lib/escolar/administracion/flujos-puro.ts");
const A = await import("../lib/escolar/materia/actividades-puro.ts");
const M = await import("../lib/escolar/mensajes-internos.ts");
const C = await import("../lib/escolar/administracion/constancia-puro.ts");

let pasadas = 0;
let fallos = 0;
function ok(nombre, cond, detalle = "") {
  if (cond) { pasadas++; console.log(`  ok  ${nombre}`); }
  else { fallos++; console.error(`  FALLA ${nombre} ${detalle}`); }
}
const eq = (a, b, nombre) =>
  ok(nombre, JSON.stringify(a) === JSON.stringify(b), `→ ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/* ── Citas ─────────────────────────────────────────────────────────────── */
console.log("\ncitas — máquina de estados");
ok("pendiente → aceptada", F.puedeTransicionarCita("pendiente", "aceptada"));
ok("pendiente → rechazada", F.puedeTransicionarCita("pendiente", "rechazada"));
ok("aceptada → finalizada", F.puedeTransicionarCita("aceptada", "finalizada"));

// La que de verdad importa: finalizar algo que nadie aceptó sería inventar que
// la cita ocurrió.
ok("pendiente NO salta a finalizada", !F.puedeTransicionarCita("pendiente", "finalizada"));
ok("rechazada es terminal", F.esEstadoCitaTerminal("rechazada"));
ok("finalizada es terminal", F.esEstadoCitaTerminal("finalizada"));
ok("una rechazada no revive", !F.puedeTransicionarCita("rechazada", "aceptada"));
ok("pendiente NO es terminal", !F.esEstadoCitaTerminal("pendiente"));
for (const e of F.ESTADOS_CITA) {
  ok(`«${e}» no transiciona a sí mismo`, !F.puedeTransicionarCita(e, e));
}

/* ── Constancias ───────────────────────────────────────────────────────── */
console.log("\nconstancias");
ok("pendiente → aceptada", F.puedeTransicionarConstancia("pendiente", "aceptada"));
ok("aceptada → entregada", F.puedeTransicionarConstancia("aceptada", "entregada"));
// No se entrega lo que no se aprobó.
ok("pendiente NO salta a entregada", !F.puedeTransicionarConstancia("pendiente", "entregada"));
// Y lo entregado ya está en manos del alumno: anularlo no lo recupera.
ok("entregada es terminal", !F.puedeTransicionarConstancia("entregada", "anulada"));

/* ── Reportes ──────────────────────────────────────────────────────────── */
console.log("\nreportes");
ok("gravedad válida", F.esGravedadValida("grave"));
ok("gravedad inventada se rechaza", !F.esGravedadValida("gravísima"));
ok("cadena vacía no es gravedad", !F.esGravedadValida(""));
eq(
  ["leve", "grave", "media"].sort(F.compararGravedad),
  ["grave", "media", "leve"],
  "ordena por gravedad descendente",
);
ok("un reporte sin anular no está anulado", !F.estaAnulado({ anulado_at: null }));
ok("con fecha de anulación, sí", F.estaAnulado({ anulado_at: "2026-09-17T10:00:00Z" }));

/* ── Buzón ─────────────────────────────────────────────────────────────── */
console.log("\nbuzón");
ok("queja es tipo válido", F.esTipoBuzonValido("queja"));
ok("comentario es tipo válido", F.esTipoBuzonValido("comentario"));
ok("otro tipo se rechaza", !F.esTipoBuzonValido("sugerencia"));
ok("sin leer se detecta", F.sinLeer({ leido_at: null }));
ok("leído se detecta", !F.sinLeer({ leido_at: "2026-09-17T10:00:00Z" }));

/* ── sanearTexto ───────────────────────────────────────────────────────── */
console.log("\nsanearTexto");
eq(F.sanearTexto("  hola  "), "hola", "recorta los extremos");
eq(F.sanearTexto("   "), null, "solo espacios es null, no cadena vacía");
eq(F.sanearTexto(""), null, "vacío es null");
eq(F.sanearTexto(undefined), null, "undefined es null");
eq(F.sanearTexto(42), null, "un número no es texto");
ok("acota al máximo", F.sanearTexto("x".repeat(5000)).length === F.LARGO_MAX_TEXTO);
eq(F.sanearTexto("abcdef", 3), "abc", "respeta un máximo propio");

/* ── Actividades: el estado DERIVADO ───────────────────────────────────── */
console.log("\nactividades — estado derivado, no guardado");
const AHORA = new Date("2026-09-17T12:00:00Z");
const act = (f) => ({ fecha_limite: f });

eq(A.estadoActividad(act("2026-09-20T12:00:00Z"), AHORA), "activa", "futura es activa");
eq(A.estadoActividad(act("2026-09-10T12:00:00Z"), AHORA), "vencida", "pasada es vencida");
// Sin fecha NO es «activa para siempre»: es su propio estado, porque a alguien
// se le olvidó ponerle plazo y eso hay que poder verlo.
eq(A.estadoActividad(act(null), AHORA), "sin-fecha", "sin fecha tiene estado propio");
eq(A.estadoActividad(act("no es fecha"), AHORA), "sin-fecha", "una fecha inválida no revienta");
// El borde exacto cuenta como activa: hasta el instante del plazo, se entrega.
eq(A.estadoActividad(act("2026-09-17T12:00:00Z"), AHORA), "activa", "justo en el plazo, activa");

ok("una activa admite entrega", A.admiteEntrega(act("2026-09-20T12:00:00Z"), AHORA));
ok("una vencida NO admite entrega", !A.admiteEntrega(act("2026-09-10T12:00:00Z"), AHORA));
ok("una sin fecha admite entrega", A.admiteEntrega(act(null), AHORA));

// La misma actividad cambia de estado con el tiempo, sin tocar la base: eso es
// lo que hace que derivar sea mejor que guardar.
const fija = act("2026-09-18T00:00:00Z");
eq(A.estadoActividad(fija, new Date("2026-09-17T00:00:00Z")), "activa", "antes del plazo: activa");
eq(A.estadoActividad(fija, new Date("2026-09-19T00:00:00Z")), "vencida", "después: vencida, sin escribir nada");

console.log("\nactividades — pesos");
eq(A.totalPesos([{ peso: 20 }, { peso: 30 }]), 50, "suma los pesos");
eq(A.totalPesos([{ peso: null }, { peso: 10 }]), 10, "null cuenta como cero");
eq(A.totalPesos([]), 0, "sin actividades, cero");
ok("100 exacto cuadra", A.pesosCuadran([{ peso: 100 }]));
ok("60+40 cuadra", A.pesosCuadran([{ peso: 60 }, { peso: 40 }]));
ok("90 no cuadra", !A.pesosCuadran([{ peso: 90 }]));
// Tolerancia: los pesos son numeric(5,2) y comparar decimales con === falla.
ok("33.33×3 cuadra dentro de la tolerancia", A.pesosCuadran([{ peso: 33.34 }, { peso: 33.33 }, { peso: 33.33 }]));

console.log("\nactividades — orden de presentación");
const lote = [
  { id: "vencida", fecha_limite: "2026-09-10T00:00:00Z" },
  { id: "sinfecha", fecha_limite: null },
  { id: "activa-lejos", fecha_limite: "2026-09-30T00:00:00Z" },
  { id: "activa-pronto", fecha_limite: "2026-09-18T00:00:00Z" },
];
eq(
  A.ordenarParaAlumno(lote, AHORA).map((x) => x.id),
  ["activa-pronto", "activa-lejos", "vencida", "sinfecha"],
  "activas primero y por urgencia; sin fecha al final",
);
const copia = JSON.stringify(lote);
A.ordenarParaAlumno(lote, AHORA);
ok("ordenar no muta la entrada", JSON.stringify(lote) === copia);

/* ── Mensajes internos: agrupado en hilos ──────────────────────────────── */
console.log("\nmensajes internos — hilos");
const m = (hilo, de, para, at, leido = null) => ({
  id: `${hilo}-${at}`, hilo_id: hilo, de_profesor: de, para_profesor: para,
  asunto: null, cuerpo: `msg ${at}`, leido_at: leido, created_at: at,
});
const YO = 1;
const hilos = M.agruparEnHilos(
  [
    m("h1", 2, YO, "2026-09-17T10:00:00Z"),
    m("h1", YO, 2, "2026-09-17T09:00:00Z"),
    m("h2", 3, YO, "2026-09-17T11:00:00Z"),
  ],
  YO,
);
eq(hilos.length, 2, "dos hilos");
eq(hilos[0].hiloId, "h2", "el hilo más reciente va primero");
eq(hilos[0].conQuien, 3, "«con quién» es el otro, no yo");
eq(hilos[1].ultimoCuerpo, "msg 2026-09-17T10:00:00Z", "el último mensaje del hilo");

// Mis propios mensajes nunca están «sin leer» para mí.
const soloMios = M.agruparEnHilos([m("h3", YO, 2, "2026-09-17T10:00:00Z")], YO);
eq(soloMios[0].sinLeer, 0, "lo que yo envié no cuenta como sin leer");
const paraMi = M.agruparEnHilos([m("h4", 2, YO, "2026-09-17T10:00:00Z")], YO);
eq(paraMi[0].sinLeer, 1, "lo que me enviaron y no he leído, sí");
const yaLeido = M.agruparEnHilos([m("h5", 2, YO, "2026-09-17T10:00:00Z", "2026-09-17T10:05:00Z")], YO);
eq(yaLeido[0].sinLeer, 0, "lo leído no cuenta");
eq(M.agruparEnHilos([], YO), [], "sin mensajes, sin hilos");

/* ── Constancia de estudios (beta) ─────────────────────────────────────── */
console.log("\nconstancia de estudios — vista previa beta");
const COMPLETO = {
  nombre: "Ana Pérez López", curp: "pela050101mqtrrna1", matricula: "2305001",
  grado: "3RO", grupo: "A", carrera: "MECATRONICA", ciclo: "AGO 2026 - ENE 2027",
  fecha: new Date(2026, 8, 24),
};
const armada = C.armarConstancia(COMPLETO);
eq(armada.faltantesAlumno, [], "con el expediente completo no falta ningún dato del alumno");
ok("el cuerpo nombra al alumno en mayúsculas", armada.cuerpo?.includes("ANA PÉREZ LÓPEZ"));
ok("…con su CURP normalizada", armada.cuerpo?.includes("PELA050101MQTRRNA1"));
ok("…su matrícula, grado, grupo, carrera y ciclo", ["2305001", "3RO semestre", "grupo A", "MECATRONICA", "AGO 2026 - ENE 2027"].every((x) => armada.cuerpo?.includes(x)));
eq(armada.lugarYFecha, "El Marqués, Querétaro, a 24 de septiembre de 2026", "fecha en español, sin depender del idioma del equipo");
eq(C.fechaLarga(new Date(2027, 0, 5)), "5 de enero de 2027", "enero es el mes 0");
// Lo institucional NUNCA se inventa: siempre se declara pendiente.
eq([...armada.faltantesInstitucion], ["Folio consecutivo", "Clave del centro de trabajo (CCT)", "Nombre y cargo de quien la expide", "Firma", "Sello del plantel"], "folio, CCT, firma y sello se declaran pendientes");
const sinGrupo = C.armarConstancia({ ...COMPLETO, grado: "", grupo: "" });
eq(sinGrupo.cuerpo, null, "sin inscripción no se arma el texto (no se inventa el grado)");
ok("…y se dice qué falta", sinGrupo.faltantesAlumno.some((f) => f.startsWith("Grado y grupo")));
const sinCiclo = C.armarConstancia({ ...COMPLETO, ciclo: "  " });
ok("un ciclo en blanco cuenta como faltante", sinCiclo.faltantesAlumno.includes("Ciclo escolar en curso") && sinCiclo.cuerpo === null);
const sinMatricula = C.armarConstancia({ ...COMPLETO, matricula: "" });
ok("sin matrícula el texto se arma igual, sin la frase de matrícula", sinMatricula.cuerpo !== null && !sinMatricula.cuerpo.includes("matrícula"));

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
