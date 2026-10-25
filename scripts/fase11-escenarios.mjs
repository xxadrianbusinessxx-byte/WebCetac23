/**
 * FASE 11 — ESCENARIOS: lo que hace cada rol al entrar, con las Server Actions reales.
 *
 * Qué mide: nada por sí solo. Define, por rol, la secuencia de llamadas que la app
 * hace hoy desde que alguien abre la portada hasta que mira sus datos, y elige
 * usuarios reales para ejecutarla (solo lectura). La lista sale del código vivo:
 *   portada         app/page.tsx → leerPortadaPublica
 *   login           app/actions/login.ts → validarAccesoPortal (clave INCORRECTA:
 *                   recorre el camino completo sin conocer ninguna contraseña)
 *   entrada alumno  app/oceano/page.tsx → actionObtenerPerfilAlumno, y las piezas que
 *                   el alumno abre: calificaciones, boleta, asistencia, reportes,
 *                   justificantes
 *   entrada tutor   actionListarAlumnosDelTutor → el perfil del hijo → calificaciones, boleta
 *   entrada docente actionListarMateriasConNombreVisible + obtenerCicloOperativoGlobal
 *                   → la hoja de una materia (actionObtenerVistaMateria)
 *   directivo       lo del docente + panel de tutores + buscador de expediente
 *
 * Qué escribe: nada. Ninguna action de esta lista escribe (son lecturas del portal).
 * Ningún dato personal sale de aquí: el que llama imprime solo cifras.
 */
import { createClient as clienteSupabase } from "@supabase/supabase-js";
import { importar } from "./fase11-entorno.mjs";

const CLAVE_FALSA = "fase11-no-es-una-clave";

/** Carga los módulos reales una sola vez. */
export async function cargarModulos() {
  const [
    server,
    portada,
    login,
    escolar,
    califs,
    boletas,
    asist,
    admin,
    justif,
    tutores,
    materias,
    ciclo,
    profesores,
  ] = await Promise.all([
    importar("lib/supabase/server.ts"),
    importar("lib/escolar/portada/portada.ts"),
    importar("lib/auth/portal-login.ts"),
    importar("app/actions/escolar.ts"),
    importar("app/actions/calificaciones-normalizadas.ts"),
    importar("app/actions/boletas.ts"),
    importar("app/actions/asistencias.ts"),
    importar("app/actions/administracion.ts"),
    importar("app/actions/justificaciones.ts"),
    importar("app/actions/tutores.ts"),
    importar("app/actions/materias.ts"),
    importar("lib/escolar/ciclo/ciclo-estado.ts"),
    importar("lib/escolar/catalogo/profesores.ts"),
  ]);
  return { server, portada, login, escolar, califs, boletas, asist, admin, justif, tutores, materias, ciclo, profesores };
}

/** Resume el resultado de un paso sin datos personales: ok / vacío / error. */
export function etiquetar(v) {
  if (v == null) return "null";
  if (Array.isArray(v)) return v.length ? `ok(${v.length})` : "vacío";
  if (typeof v === "object") {
    if (v.ok === false) return `rechazo: ${String(v.error ?? "").slice(0, 60)}`;
    if ("acceso" in v) return v.acceso?.puedeLeer ? `ok(materias ${v.materias?.length ?? 0})` : "sin acceso";
    for (const k of ["alumnos", "reportes", "justificaciones", "materias", "estados", "filas", "tutores"]) {
      if (Array.isArray(v[k])) return v[k].length ? `ok(${k} ${v[k].length})` : `vacío(${k})`;
    }
    return "ok";
  }
  return String(v);
}

const anon = (m) => m.server.createClient();

/** Los escenarios. Cada paso recibe (m, sujeto, memo) y devuelve el valor de la action. */
export const ESCENARIOS = {
  portada: {
    rol: null,
    pasos: [["portada · leerPortadaPublica", async (m) => m.portada.leerPortadaPublica(await anon(m))]],
  },
  login_alumno: {
    rol: "alumno",
    pasos: [["login · validarAccesoPortal (alumno)", async (m, s) => m.login.validarAccesoPortal(await anon(m), s.identificador, CLAVE_FALSA)]],
  },
  login_tutor: {
    rol: "tutor",
    pasos: [["login · validarAccesoPortal (tutor)", async (m, s) => m.login.validarAccesoPortal(await anon(m), s.identificador, CLAVE_FALSA)]],
  },
  login_docente: {
    rol: "maestro",
    pasos: [["login · validarAccesoPortal (docente)", async (m, s) => m.login.validarAccesoPortal(await anon(m), s.identificador, CLAVE_FALSA)]],
  },
  entrada_alumno: {
    rol: "alumno",
    pasos: [
      ["alumno · perfil (/oceano)", async (m) => m.escolar.actionObtenerPerfilAlumno(null)],
      ["alumno · calificaciones (lista)", async (m, s, memo) => (memo.vista = await m.califs.actionVistaCalificacionesAlumno(null))],
      ["alumno · calificaciones (materia)", async (m, s, memo) => m.califs.actionVistaCalificacionesAlumno(null, primeraMateria(memo.vista))],
      ["alumno · boleta", async (m, s) => m.boletas.actionBoletaAlumno({ curp: s.curp })],
      ["alumno · asistencia", async (m, s) => m.asist.actionObtenerEstadosAsistenciaAlumno({ curp: s.curp })],
      ["alumno · reportes", async (m, s) => m.admin.actionListarReportesDeAlumno(s.curp)],
      ["alumno · justificantes", async (m, s) => m.justif.actionObtenerJustificacionesDeAlumno(s.curp)],
    ],
  },
  entrada_tutor: {
    rol: "tutor",
    pasos: [
      ["tutor · alumnos vinculados", async (m, s, memo) => (memo.hijos = await m.tutores.actionListarAlumnosDelTutor())],
      ["tutor · perfil del hijo", async (m, s, memo) => m.escolar.actionObtenerPerfilAlumno(memo.hijos?.[0]?.curp ?? null)],
      ["tutor · calificaciones (lista)", async (m, s, memo) => (memo.vista = await m.califs.actionVistaCalificacionesAlumno(memo.hijos?.[0]?.curp ?? null))],
      ["tutor · boleta", async (m, s, memo) => m.boletas.actionBoletaAlumno({ curp: memo.hijos?.[0]?.curp ?? "" })],
    ],
  },
  entrada_docente: {
    rol: "maestro",
    pasos: [
      ["docente · catálogo de materias", async (m, s, memo) => (memo.materias = await m.materias.actionListarMateriasConNombreVisible())],
      ["docente · ciclo operativo", async (m) => m.ciclo.obtenerCicloOperativoGlobal(await anon(m))],
      ["docente · hoja de una materia", async (m, s, memo) => m.escolar.actionObtenerVistaMateria(memo.materias?.[0]?.idInterno ?? "")],
    ],
  },
  entrada_directivo: {
    rol: "directivo",
    pasos: [
      ["directivo · catálogo de materias", async (m) => m.materias.actionListarMateriasConNombreVisible()],
      ["directivo · ciclo operativo", async (m) => m.ciclo.obtenerCicloOperativoGlobal(await anon(m))],
      ["directivo · buscar expediente", async (m) => m.admin.actionBuscarAlumnosExpediente("mar")],
    ],
  },
  // Administración escolar: el panel de tutores (C-4 de la FASE 10) es suyo
  // (`tutor.ver_lista`), y abre expedientes desde el buscador.
  entrada_administracion: {
    rol: "administracion",
    pasos: [
      ["administración · ciclo operativo", async (m) => m.ciclo.obtenerCicloOperativoGlobal(await anon(m))],
      ["administración · panel de tutores", async (m) => m.tutores.actionListarTutoresConCredenciales()],
      ["administración · buscar expediente", async (m, s, memo) => (memo.busqueda = await m.admin.actionBuscarAlumnosExpediente("mar"))],
      ["administración · abrir expediente", async (m, s, memo) => m.escolar.actionObtenerPerfilAlumno(memo.busqueda?.alumnos?.[0]?.curp ?? null)],
    ],
  },
};

function primeraMateria(vista) {
  const lista = vista?.materias ?? [];
  return lista[0]?.grupoMateriaId ?? null;
}

/**
 * Elige hasta `n` usuarios reales por rol (solo lectura, service_role). Arma la
 * sesión con la MISMA forma que devuelve `validarAccesoPortal` al entrar.
 */
export async function elegirSujetos(m, n) {
  const svc = clienteSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const barajar = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  const { data: ins } = await svc.from("inscripciones_alumno").select("curp").eq("activo", true).limit(2000);
  const curps = barajar([...new Set((ins ?? []).map((i) => i.curp))]).slice(0, n);
  const { data: alumnosRows } = await svc.from("ALUMNOS").select("CURP, P_APELLIDO, S_APELLIDO, NOMBRE, CLAVE").in("CURP", curps);
  const { nombreCompletoAlumno } = await importar("lib/escolar/alumno/alumnos.ts");
  const alumnos = (alumnosRows ?? []).map((a) => ({
    curp: a.CURP,
    identificador: nombreCompletoAlumno(a),
    sesion: { matricula: a.CLAVE, rol: "alumno", curp: a.CURP, nombre: nombreCompletoAlumno(a) },
  }));

  const { data: rel } = await svc.from("tutor_alumnos").select("tutor_id").eq("activo", true).limit(2000);
  const idsTutor = barajar([...new Set((rel ?? []).map((r) => r.tutor_id))]).slice(0, n);
  const { data: tutoresRows } = await svc.from("tutores").select("id, nombre, apellidos, curp, usuario, activo").in("id", idsTutor).eq("activo", true);
  const tutores = (tutoresRows ?? []).map((t) => ({
    identificador: t.usuario,
    sesion: { matricula: t.id, rol: "tutor", curp: t.curp ?? undefined, nombre: `${t.nombre ?? ""} ${t.apellidos ?? ""}`.trim() },
  }));

  const { data: profRows } = await svc.from("PROFESORES").select('ID, "NOMBRE/PROFESOR/DIRECTIVO", CLAVE, Permisos, debe_cambiar_credenciales');
  const { data: asig } = await svc.from("asignaciones_profesor").select("profesor_id").eq("activo", true);
  const conAsignacion = new Set((asig ?? []).map((a) => a.profesor_id));
  const sesionProf = (p) => ({
    identificador: m.profesores.nombreProfesor(p),
    sesion: {
      matricula: p.CLAVE,
      rol: m.profesores.rolDesdePermisos(p.Permisos ?? ""),
      nombre: m.profesores.nombreProfesor(p),
      profesorId: p.ID,
      debeCambiarCredenciales: false,
    },
  });
  const profes = (profRows ?? []).map(sesionProf);
  const docentes = barajar(profes.filter((p, i) => p.sesion.rol === "maestro" && conAsignacion.has(profRows[i].ID))).slice(0, n);
  const directivos = profes.filter((p) => p.sesion.rol === "directivo").slice(0, n);
  const administracion = profes.filter((p) => p.sesion.rol === "administracion").slice(0, n);

  return { alumno: alumnos, tutor: tutores, maestro: docentes, directivo: directivos, administracion, null: [{ sesion: null }] };
}
