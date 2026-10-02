#!/usr/bin/env node
/**
 * test-uis-pendientes.mjs — suites puras de las UIs pendientes.
 *
 * QUÉ MIDE: `administracion/flujos-puro` (máquinas de estado de citas,
 *           constancias, reportes y buzón), `materia/actividades-puro` (estado
 *           derivado y pesos), el agrupado en hilos de `mensajes-internos` y
 *           la constancia de estudios de Administración escolar con el formato
 *           oficial (`administracion/constancia-puro`) y el número de control
 *           (`alumno/numero-control-puro`), 2026-09-24. Desde el 2026-10-01, la
 *           agenda de citas (`administracion/agenda-citas-puro`): franjas,
 *           huecos y la regla única de «¿se puede pedir este hueco?», y que sus
 *           listas coincidan con el CHECK de `supabase/crear-agenda-citas.sql`.
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

/* ── Agenda de citas (2026-10-01) ──────────────────────────────────────── */
console.log("\nagenda de citas — franjas");
const AG = await import("../lib/escolar/administracion/agenda-citas-puro.ts");
const HP = await import("../lib/escolar/administracion/hora-plantel-puro.ts");
const CAL = await import("../lib/escolar/ciclo/calendario.ts");
const MARTES = { id: "f1", dia_semana: "martes", hora_inicio: "09:00", hora_fin: "10:00", duracion_min: 30 };
const JUEVES = { id: "f2", dia_semana: "jueves", hora_inicio: "16:00", hora_fin: "17:00", duracion_min: 20 };
eq(AG.validarFranja(MARTES, []), { ok: true }, "una franja normal vale");
eq(AG.validarFranja({ ...MARTES, hora_fin: "09:00" }, []).ok, false, "fin igual a inicio se rechaza");
eq(AG.validarFranja({ ...MARTES, hora_fin: "08:00" }, []).ok, false, "fin antes de inicio se rechaza");
eq(AG.validarFranja({ ...MARTES, hora_fin: "09:20" }, []), { ok: false, error: "En ese horario no cabe ni una cita de 30 minutos." }, "si no cabe ni una cita, se dice");
eq(AG.validarFranja({ ...MARTES, duracion_min: 25 }, []).ok, false, "una duración fuera de la lista se rechaza");
eq(AG.validarFranja({ ...MARTES, dia_semana: "Martes" }, []).ok, false, "el día va en el vocabulario guardado (sin mayúsculas)");
eq(AG.validarFranja({ ...MARTES, hora_inicio: "9:00" }, []).ok, false, "la hora va como «HH:MM»");
eq(
  AG.validarFranja({ dia_semana: "martes", hora_inicio: "09:30", hora_fin: "11:00", duracion_min: 30 }, [MARTES]),
  { ok: false, error: "Se cruza con el horario del martes de 09:00 a 10:00." },
  "dos franjas solapadas del mismo día se rechazan, diciendo con cuál",
);
eq(AG.validarFranja({ dia_semana: "martes", hora_inicio: "10:00", hora_fin: "11:00", duracion_min: 30 }, [MARTES]), { ok: true }, "una franja que empieza donde acaba la otra NO se cruza");
eq(AG.validarFranja({ ...MARTES, dia_semana: "miercoles" }, [MARTES]), { ok: true }, "la misma hora otro día no se cruza");
eq(AG.validarFranja(MARTES, [MARTES]), { ok: true }, "una franja no se compara consigo misma (mismo id)");
eq(AG.huecosDeFranja(MARTES), ["09:00", "09:30"], "09:00–10:00 de 30 min → 09:00 y 09:30");
eq(AG.huecosDeFranja({ ...MARTES, hora_fin: "10:10" }), ["09:00", "09:30"], "la última cita tiene que caber ENTERA");
eq(AG.huecosDeFranja(JUEVES), ["16:00", "16:20", "16:40"], "16:00–17:00 de 20 min → tres citas");

console.log("\nagenda de citas — fechas");
eq(AG.sumarDias("2026-12-31", 1), "2027-01-01", "sumar días cruza el año");
eq(AG.sumarDias("2028-02-28", 1), "2028-02-29", "…y respeta el bisiesto");
eq(AG.rangoDeSolicitud("2026-10-01"), { desde: "2026-10-02", hasta: "2026-10-31" }, "se pide de mañana a 30 días");
ok("el 30 de febrero no es fecha", !AG.esFechaValida("2026-02-30"));
eq(HP.hoyEnElPlantel(new Date("2026-10-02T03:00:00Z")), "2026-10-01", "a las 21:00 del plantel sigue siendo «hoy», aunque en UTC ya sea mañana");
eq(AG.validarDiaBloqueado("2026-10-01", "2026-10-01"), { ok: true }, "se puede bloquear hoy (avisar tarde es mejor que no avisar)");
eq(AG.validarDiaBloqueado("2026-09-30", "2026-10-01").ok, false, "no se bloquea un día pasado");
eq(AG.validarDiaBloqueado("2027-10-02", "2026-10-01").ok, false, "ni a más de un año");
eq(AG.validarDiaBloqueado("ayer", "2026-10-01").ok, false, "ni algo que no es fecha");
eq(Object.keys(AG.NOMBRE_DIA), [...CAL.DIAS_SEMANA], "los rótulos cubren exactamente el vocabulario de DIAS_SEMANA");

console.log("\nagenda de citas — ¿se puede pedir este hueco?");
const HOY_CITA = "2026-10-01"; // jueves
const VACIA = { franjas: [], bloqueados: new Set(), ocupados: new Set() };
const AGENDA = { franjas: [MARTES, JUEVES], bloqueados: new Set(), ocupados: new Set() };
const v = (fecha, hora, agenda = AGENDA) => AG.validarSolicitudCita({ fecha, hora }, agenda, HOY_CITA);
eq(v("2026-10-06", "09:00", VACIA), { ok: false, error: AG.SIN_AGENDA }, "sin agenda publicada nadie pide cita");
eq(v("2026-10-06", "09:00"), { ok: true }, "martes 6 a las 09:00: vale");
eq(v("2026-10-01", "16:00"), { ok: false, error: "La cita tiene que ser a partir de mañana." }, "hoy no");
eq(v("2026-09-29", "09:00").ok, false, "una fecha pasada no");
eq(v("2026-11-03", "09:00"), { ok: false, error: "La cita no puede ser a más de 30 días." }, "a más de 30 días no");
eq(v("2026-10-07", "09:00"), { ok: false, error: "La dirección no atiende citas los miércoles." }, "un día sin franja se nombra, con acento");
eq(v("2026-10-06", "09:15"), { ok: false, error: "Esa hora está fuera del horario de citas." }, "una hora que no es inicio de cita no");
eq(v("2026-10-06", "10:00").ok, false, "la hora de fin no es un hueco");
eq(v("2026-02-30", "09:00").ok, false, "una fecha imposible no");
eq(v("2026-10-06", "9:00").ok, false, "una hora mal escrita no");
const CON_BLOQUEO = { ...AGENDA, bloqueados: new Set(["2026-10-13"]) };
eq(v("2026-10-13", "09:00", CON_BLOQUEO), { ok: false, error: "La dirección no atiende citas ese día." }, "un día bloqueado no");
const CON_OCUPADO = { ...AGENDA, ocupados: new Set([AG.claveHueco({ fecha: "2026-10-06", hora: "09:00" })]) };
eq(v("2026-10-06", "09:00", CON_OCUPADO), { ok: false, error: AG.HUECO_OCUPADO }, "un hueco ya pedido no");
eq(v("2026-10-06", "09:30", CON_OCUPADO), { ok: true }, "…pero el siguiente del mismo día sí");

console.log("\nagenda de citas — huecos que se ofrecen");
const todos = AG.huecosDisponibles(AGENDA, HOY_CITA);
eq(todos.length, 20, "octubre: 4 martes × 2 + 4 jueves × 3 = 20 huecos");
eq(todos[0], { fecha: "2026-10-06", hora: "09:00" }, "el primero es el martes 6 a las 09:00");
eq(todos.at(-1), { fecha: "2026-10-29", hora: "16:40" }, "el último, el jueves 29 a las 16:40");
ok("hoy (jueves 1) no se ofrece aunque sea jueves", !todos.some((h) => h.fecha === HOY_CITA));
ok("salen en orden de fecha y hora", todos.every((h, i) => i === 0 || AG.claveHueco(todos[i - 1]) < AG.claveHueco(h)));
const filtrados = AG.huecosDisponibles({ ...AGENDA, bloqueados: CON_BLOQUEO.bloqueados, ocupados: CON_OCUPADO.ocupados }, HOY_CITA);
eq(filtrados.length, 17, "bloquear el martes 13 quita 2 y un hueco ocupado quita 1");
ok("el día bloqueado no se ofrece", !filtrados.some((h) => h.fecha === "2026-10-13"));
ok("el hueco ocupado no se ofrece", !filtrados.some((h) => h.fecha === "2026-10-06" && h.hora === "09:00"));
// La propiedad que hace de las dos funciones UNA regla.
ok(
  "PROPIEDAD: todo hueco ofrecido lo acepta validarSolicitudCita",
  filtrados.every((h) => AG.validarSolicitudCita(h, { ...AGENDA, bloqueados: CON_BLOQUEO.bloqueados, ocupados: CON_OCUPADO.ocupados }, HOY_CITA).ok),
);
eq(AG.huecosDisponibles(VACIA, HOY_CITA), [], "sin agenda, ningún hueco");

console.log("\nagenda de citas — el código y el .sql dicen lo mismo");
const fsAg = await import("node:fs");
const sqlAgenda = fsAg.readFileSync(new URL("../supabase/crear-agenda-citas.sql", import.meta.url), "utf8");
const durSql = /duracion_min in \(([^)]+)\)/.exec(sqlAgenda)?.[1].split(",").map((s) => Number(s.trim()));
eq(durSql, [...AG.DURACIONES_CITA], "DURACIONES_CITA = el CHECK de citas_franjas.duracion_min");
const diasSql = /dia_semana in \(([^)]+)\)/.exec(sqlAgenda)?.[1].split(",").map((s) => s.trim().replace(/'/g, ""));
eq(diasSql, [...CAL.DIAS_SEMANA], "el CHECK de dia_semana = DIAS_SEMANA");
ok("el índice único cubre las citas que ocupan su hora", /ux_citas_hueco_vivo[\s\S]*estado in \('pendiente','aceptada'\)/.test(sqlAgenda));

console.log(`\nResultado: ${pasadas + fallos} verificaciones · ${pasadas} pasadas, ${fallos} fallidas`);
if (fallos > 0) process.exit(1);
