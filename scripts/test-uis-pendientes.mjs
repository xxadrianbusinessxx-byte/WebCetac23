#!/usr/bin/env node
/**
 * test-uis-pendientes.mjs — suites puras de las UIs pendientes.
 *
 * QUÉ MIDE: `administracion/flujos-puro` (máquinas de estado de citas,
 *           constancias, reportes y buzón), `materia/actividades-puro` (estado
 *           derivado y pesos), el agrupado en hilos de `mensajes-internos` y
 *           la constancia de estudios de Administración escolar con el formato
 *           oficial (`administracion/constancia-puro`) y el número de control
 *           (`alumno/numero-control-puro`), 2026-09-24.
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
const NC = await import("../lib/escolar/alumno/numero-control-puro.ts");

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

/* ── Constancia de estudios (formato oficial) ──────────────────────────── */
console.log("\nconstancia de estudios — formato oficial del plantel");
const COMPLETO = {
  nombre: "Adrian Uriel Trejo Zárate", curp: "teza080110hqtrrda5", numeroControl: "23222040230009",
  grado: "6TO", carrera: "MECATRONICA", inicioSemestre: "2026-02-16", finSemestre: "2026-07-30",
  fecha: new Date(2026, 5, 1),
};
const cons = C.armarConstancia(COMPLETO);
// El caso real de la constancia que la escuela ya emite: mismo texto, dato por dato.
eq(cons.faltantes, [], "con el expediente completo no falta nada");
eq(cons.nombre, "ADRIAN URIEL TREJO ZÁRATE", "el nombre, en mayúsculas");
eq(cons.curp, "TEZA080110HQTRRDA5", "la CURP normalizada");
eq(cons.numeroControl, "23222040230009", "el número de control");
eq(cons.semestre, "SEXTO", "«6TO» → SEXTO");
eq(cons.carrera, "TÉCNICO EN MECATRÓNICA", "MECATRONICA → TÉCNICO EN MECATRÓNICA, con acento");
eq(cons.periodo, "16 de Febrero al 30 de Julio de 2026", "el semestre, como lo escribe el formato");
eq(cons.fechaEnLetras, "uno de Junio del año dos mil veintiséis", "la fecha de expedición en letras");
eq([cons.tratamiento, cons.inscrito, cons.interesado], ["el alumno", "INSCRITO", "al interesado"], "H en la CURP → el alumno, INSCRITO");
const alumna = C.armarConstancia({ ...COMPLETO, curp: "GABL050101MQTRRZA1" });
eq([alumna.tratamiento, alumna.inscrito, alumna.interesado], ["la alumna", "INSCRITA", "a la interesada"], "M en la CURP → la alumna, INSCRITA");
eq(C.tituloCarrera("RECURSOS HUMANOS"), "TÉCNICO EN RECURSOS HUMANOS", "RECURSOS HUMANOS → TÉCNICO EN RECURSOS HUMANOS");
eq(C.tituloCarrera("RH"), "TÉCNICO EN RECURSOS HUMANOS", "…también por su clave RH");
eq(C.tituloCarrera("Mecatrónica"), "TÉCNICO EN MECATRÓNICA", "…y con acento o en minúsculas");
eq(["1RO", "2DO", "3RO", "4TO", "5TO", "6TO"].map(C.semestreEnLetras), ["PRIMER", "SEGUNDO", "TERCER", "CUARTO", "QUINTO", "SEXTO"], "los seis semestres");
eq(C.semestreEnLetras("7MO"), null, "un grado fuera de 1–6 no se inventa");
eq(C.periodoSemestre("2026-08-31", "2027-01-15"), "31 de Agosto de 2026 al 15 de Enero de 2027", "si cruza de año, cada fecha lleva el suyo");
eq(C.periodoSemestre(null, "2026-12-11"), null, "sin fecha de inicio no hay periodo");
eq([1, 16, 21, 22, 30, 31].map(C.numeroEnLetras), ["uno", "dieciséis", "veintiuno", "veintidós", "treinta", "treinta y uno"], "días en letras");
eq([2026, 2030, 2041].map(C.anioEnLetras), ["dos mil veintiséis", "dos mil treinta", "dos mil cuarenta y uno"], "años en letras");
eq(C.fechaEnLetras(new Date(2026, 11, 31)), "treinta y uno de Diciembre del año dos mil veintiséis", "31 de diciembre");
const sinNumero = C.armarConstancia({ ...COMPLETO, numeroControl: null });
ok("sin número de control no se emite", sinNumero.faltantes.includes("Número de control"));
const sinGrupo = C.armarConstancia({ ...COMPLETO, grado: "", carrera: "" });
ok("sin inscripción faltan semestre y carrera", sinGrupo.faltantes.some((f) => f.startsWith("Semestre")) && sinGrupo.faltantes.includes("Carrera"));
eq(C.PLANTEL.cct, "22DCM0001I", "el C.C.T. del plantel");

/* ── Día para recoger la constancia ────────────────────────────────────── */
console.log("\ndía para recoger la constancia");
const HOY = new Date(2026, 8, 25); // jueves 25 de septiembre de 2026
eq(F.validarFechaRecogida("2026-09-26", HOY), { ok: false, error: "Elige un día entre lunes y viernes." }, "el 26 es sábado: se rechaza");
eq(F.validarFechaRecogida("2026-09-29", HOY), { ok: true }, "el martes siguiente vale");
eq(F.validarFechaRecogida("2026-09-25", HOY).ok, false, "el mismo día no da tiempo a prepararla");
eq(F.validarFechaRecogida("2026-09-20", HOY).ok, false, "una fecha pasada se rechaza");
eq(F.validarFechaRecogida("2026-11-24", HOY), { ok: true }, "a 60 días, vale");
eq(F.validarFechaRecogida("2026-12-01", HOY).ok, false, "a más de 60 días, no");
eq(F.validarFechaRecogida("2026-02-30", HOY), { ok: false, error: "Esa fecha no existe." }, "el 30 de febrero no existe");
eq(F.validarFechaRecogida("30/09/2026", HOY).ok, false, "solo el formato del selector de fecha");
eq(F.validarFechaRecogida("", HOY).ok, false, "sin día no hay solicitud");

/* ── Número de control ─────────────────────────────────────────────────── */
console.log("\nnúmero de control");
eq(NC.validarNumeroControl(" 2322 2040 2300 09 "), { ok: true, valor: "23222040230009" }, "quita los espacios de en medio (se dictan en grupos)");
eq(NC.validarNumeroControl("ab-123"), { ok: true, valor: "AB-123" }, "pasa a mayúsculas y admite guion");
eq(NC.validarNumeroControl("   "), { ok: true, valor: null }, "vacío = quitar el número");
ok("menos de 4 caracteres se rechaza", !NC.validarNumeroControl("123").ok);
ok("más de 20 se rechaza", !NC.validarNumeroControl("1".repeat(21)).ok);
ok("un signo raro se rechaza", !NC.validarNumeroControl("2322/2040").ok);
ok("la regla es la del CHECK de la base", String(NC.FORMATO_NUMERO_CONTROL) === "/^[A-Z0-9-]{4,20}$/");

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
