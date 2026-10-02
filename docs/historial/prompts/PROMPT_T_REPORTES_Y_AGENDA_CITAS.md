# PROMPT — Reportes en Notificaciones del alumno · Agenda de citas del directivo

> Diagnóstico hecho por Claude el 2026-10-01 sobre el código en `d7b2803` y la
> base real (solo lectura). **Todo lo de «ESTADO ACTUAL» está verificado: no lo
> re-investigues.** Dos partes independientes; entrega A y B en commits separados.

---

## PARTE A — Los reportes disciplinarios llegan a Notificaciones del alumno

### OBJETIVO
Un reporte disciplinario que Dirección o Administración escolar levanta sobre un
alumno aparece en **Perfil › Notificaciones** de ese alumno. Como el tutor ve el
perfil de su hijo con la misma pieza, el padre lo ve también, sin trabajo extra.

### ESTADO ACTUAL (verificado — no re-investigar)
- Tabla `reportes_alumno` (`supabase/crear-tablas-uis-pendientes.sql` §2): `id,
  periodo_id, curp, grupo_id, motivo, gravedad ('leve'|'media'|'grave'),
  ocurrido_at timestamptz, creado_por, created_at, anulado_at, anulado_por,
  motivo_anulacion`. Hoy tiene **1 fila** (anulada).
- Solo se leen en `actionListarReportes` (`app/actions/administracion.ts`), que
  exige `reporte.ver`: la tienen **directivo** y **administracion**, no alumno ni
  tutor. Ningún otro camino los lee.
- Notificaciones **no es una tabla**: es una lista calculada en vivo por el módulo
  puro `lib/navegacion/notificaciones-alumno.ts` a partir de DOS fuentes
  (comentarios y justificaciones). La pinta `app/components/oceano/notificaciones-alumno.tsx`,
  que recibe la `curp` del alumno mostrado (el propio alumno, el hijo elegido por
  el tutor, o el alumno del buscador en Administración › Expediente).
- El modelo de la segunda fuente ya existe: `actionObtenerJustificacionesDeAlumno(curp)`
  (`app/actions/justificaciones.ts:421`) — capacidad + alcance por CURP.
- Los modos de la barra vienen del mapa: `lib/navegacion/mapa-navegacion.ts`,
  `PERFIL_ALUMNO` y `EXPEDIENTE`, ambos `act("notificaciones", "Notificaciones",
  ["Comentarios", "Justificaciones"])`. `PERFIL_TUTOR` reutiliza los apartados de
  `PERFIL_ALUMNO`.

**Causa raíz:** los reportes no son una fuente de la lista de notificaciones, y
alumno/tutor no tienen ninguna capacidad para leerlos. No es un fallo de envío:
no hay nada que «enviar», la lista se arma al abrirla.

### RESULTADO ESPERADO
1. **Capacidad nueva `reporte.ver_propios`** en `lib/auth/capacidades.ts`, asignada
   en `lib/auth/permisos.ts` a `alumno`, `tutor` y `administracion` (esta última
   para que el Expediente la muestre igual). NO a maestro. Comentario junto a la
   asignación: «ver los reportes de un alumno DENTRO de su alcance; no es
   `reporte.ver`, que lista todos los del ciclo».
2. **I/O** en `lib/escolar/administracion/administracion.ts`:
   `listarReportesVisiblesDeAlumno(supabase, periodoId, curp)` → filas
   `{ id, fecha, motivo, gravedad }`, solo **no anuladas** (`anulado_at is null`),
   orden `ocurrido_at desc`. `fecha` = día **local del plantel** de `ocurrido_at`
   (ver helper del punto 3), formato `YYYY-MM-DD`.
3. **Helper puro de zona** `lib/escolar/administracion/hora-plantel-puro.ts`
   (lo usa también la Parte B):
   - `ZONA_PLANTEL = "America/Mexico_City"`.
   - `fechaHoraLocal(iso: string): { fecha: "YYYY-MM-DD"; hora: "HH:MM" }` con
     `Intl.DateTimeFormat("en-CA", { timeZone: ZONA_PLANTEL, … })`.
   - `instanteDelPlantel(fecha, hora): string` → `"${fecha}T${hora}:00-06:00"`.
     Comentario: México no tiene horario de verano desde oct-2022, el desfase es
     fijo; si algún día cambia, este es el único sitio.
   - **No** uses `toISOString().slice(0,10)`: un reporte de las 19:00 locales caería
     al día siguiente (UTC).
4. **Action** `actionListarReportesDeAlumno(curp)` en `app/actions/administracion.ts`:
   `exigir("reporte.ver_propios")` → `resolverAccesoAlumno(supabase, g.sesion, curp)`
   (ya importado en ese archivo; decide alumno=la suya, tutor=vinculados,
   administracion=cualquiera) → ciclo operativo → delega. Devuelve
   `{ ok: true; reportes } | { ok: false; error }`. try/catch con `console.error`
   como las demás.
5. **Módulo puro** `lib/navegacion/notificaciones-alumno.ts`:
   - `FuenteNotificacion` gana `"reporte"`; `ETIQUETA_FUENTE.reporte = "Reporte"`;
     `MODO_REPORTES = "Reportes"`; `fuenteDelModo` lo reconoce.
   - `notificacionesDeAlumno` acepta `reportes?: readonly ReporteNotificacion[]`
     (`{ id, fecha, motivo, gravedad }`, opcional para no romper llamadas
     existentes). Cada uno: `clave: "reporte-" + id`, `estado: null`,
     `detalle: motivo`, y un campo nuevo `gravedad: Gravedad | null` en
     `NotificacionAlumno` (null en comentarios y justificaciones).
   - La regla de orden NO cambia (un reporte no «pide acción»: peso 1).
6. **Mapa**: añade `"Reportes"` como TERCER modo de `notificaciones` en
   `PERFIL_ALUMNO` y en `EXPEDIENTE`.
7. **Componente** `notificaciones-alumno.tsx`: carga reportes en paralelo con las
   justificaciones (`Promise.all`), los pasa al módulo puro y, si `n.gravedad`,
   pinta `· Gravedad: leve|media|grave` en la cabecera; `grave` con
   `--oc-alert-text`, el resto con `--oc-muted`. Un fallo de reportes no tapa las
   justificaciones: cada fuente con su propio error.

### REGLAS
- La lógica de qué entra y en qué orden vive SOLO en el módulo puro.
- No crear tabla de notificaciones ni marcas de leído: fuera de alcance.
- Los anulados NO se muestran a alumno/tutor (decisión: un reporte anulado es un
  reporte que la escuela retiró). Dirección y Administración los siguen viendo en
  su panel de Reportes, sin cambios.
- No mostrar `creado_por` (identidad de profesor rota, ver GLOSARIO).

### SEGURIDAD
- La CURP llega del navegador: la única barrera es `resolverAccesoAlumno`. Nunca
  filtres solo en el cliente.
- Un tutor no puede ver reportes de un alumno no vinculado: añade el caso a la suite.

### INTEGRACIONES / COMPATIBILIDAD
- `npm run gen:matriz` tras añadir la action; edita a mano la §4 de
  `docs/sistema/MATRIZ-PERMISOS.md` con la capacidad nueva.
- Llamadas existentes a `notificacionesDeAlumno` sin `reportes` siguen funcionando.

### VALIDACIÓN
- `scripts/test-rediseno-oceano.mjs` §7: casos nuevos — reporte entra con su
  `gravedad`; orden mezclado con las otras dos fuentes; modo «Reportes» filtra solo
  reportes; `MODO_REPORTES === modos[2]` del mapa en alumno y en expediente;
  sin `reportes` la lista es la de antes.
- Suite del helper de zona (puede ir en la de la Parte B): `fechaHoraLocal("2026-09-26T01:30:00Z")`
  → `{ fecha: "2026-09-25", hora: "19:30" }`; ida y vuelta
  `fechaHoraLocal(instanteDelPlantel(f, h))` devuelve `{f, h}`.

---

## PARTE B — «Configurar citas»: el directivo define cuándo recibe citas

### OBJETIVO
En Administración escolar › Citas › **Configurar citas**, el directivo define en
qué días de la semana y en qué horario recibe citas, y qué fechas concretas no
atiende. Alumno y tutor **solo pueden pedir una cita dentro de esos huecos**, y
un hueco ya pedido deja de ofrecerse.

### ESTADO ACTUAL (verificado — no re-investigar)
- El modo «Configurar citas» existe solo en el mapa
  (`mapa-navegacion.ts:238`). En `app/components/administracion-panel.tsx`,
  `Citas` decide con `modo.includes("pendiente")`: «Configurar citas» cae en la
  rama de «Citas programadas». **No existe ninguna configuración**: ni tabla, ni
  action, ni pantalla.
- Tablas `citas_franjas`, `citas_dias_bloqueados`, `citas_configuracion`,
  `citas_disponibilidad`: **no existen** (PostgREST 404, medido hoy).
- `citas` tiene **1 fila** (rechazada). Sin índice de unicidad por horario.
- Alumno/tutor piden en `app/components/sesiones-programadas-panel.tsx` con un
  `<input type="datetime-local">` libre → `actionSolicitarCita({ curp, motivo,
  propuestaAt })`, que solo comprueba capacidad, alcance y que la fecha no venga
  vacía. **Se puede pedir un domingo a las 3 a. m. o en el pasado.**
- Capacidades: `cita.gestionar` solo `directivo`; `cita.solicitar` y
  `cita.ver_propias` alumno y tutor.
- De paso: `actionListarCitasPropias` devuelve las citas de TODOS los vinculados
  del tutor, no las del hijo elegido en el selector.

### RESULTADO ESPERADO

**B1 · Esquema** — archivo nuevo `supabase/crear-agenda-citas.sql`, aditivo,
idempotente, con la cabecera y el bloque RLS copiados del patrón de
`crear-tablas-uis-pendientes.sql`. **Cline lo escribe; NO lo ejecuta**: lo corre
el responsable en el SQL Editor.

```sql
create table if not exists public.citas_franjas (
  id           uuid primary key default gen_random_uuid(),
  dia_semana   smallint not null check (dia_semana between 1 and 7), -- ISO: 1=lunes
  hora_inicio  time not null,
  hora_fin     time not null,
  duracion_min smallint not null default 30 check (duracion_min in (15,20,30,45,60)),
  creado_por   bigint,
  created_at   timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);
create index if not exists ix_citas_franjas_dia on public.citas_franjas(dia_semana);

create table if not exists public.citas_dias_bloqueados (
  fecha      date primary key,
  motivo     text,
  creado_por bigint,
  created_at timestamptz not null default now()
);

-- Un hueco vivo no se puede pedir dos veces, ni en una carrera entre dos tutores.
create unique index if not exists ux_citas_hueco_vivo
  on public.citas(propuesta_at) where estado in ('pendiente','aceptada');
```
Decisiones (ya tomadas): **globales, sin `periodo_id`** — es la agenda del
director, no un dato del ciclo; los días bloqueados son fechas absolutas. Agenda
**propia**, no `calendario_escolar`: el director puede no atender un día hábil.
Registra las dos tablas en `lib/escolar/tables.ts` y en
`lib/escolar/materia/tablas-sistema.ts` (regla C15 de `test-orden`).

**B2 · Módulo puro** `lib/escolar/administracion/agenda-citas-puro.ts` (cero I/O,
usa `hora-plantel-puro.ts` de la Parte A):
- Tipos `Franja { id?, dia_semana, hora_inicio "HH:MM", hora_fin "HH:MM", duracion_min }`,
  `Hueco { fecha "YYYY-MM-DD", hora "HH:MM" }`.
- `validarFranja(f, existentes)`: formato, `inicio < fin`, cabe al menos una cita,
  duración permitida y **sin solape** con otra franja del mismo día.
- `huecosDeFranja(f)`: inicios `hora_inicio + k·duracion` mientras
  `inicio + duracion <= hora_fin`.
- `huecosDisponibles({ franjas, bloqueados: ReadonlySet<string>, ocupados:
  ReadonlySet<string> /* "fecha hora" */, hoy: string, dias = DIAS_MAXIMOS_CITA })`
  → `Hueco[]` ordenados, desde **mañana** hasta `hoy + 30` (`DIAS_MAXIMOS_CITA = 30`),
  excluyendo bloqueados y ocupados.
- `validarSolicitudCita(hueco, mismo contexto)` → `{ ok } | { ok:false, error }`
  con mensajes distintos: sin agenda publicada · fuera de rango · día sin atención
  · día bloqueado · hora fuera de horario · ya ocupado. Debe ser la MISMA regla que
  `huecosDisponibles` (implementa una sobre la otra, no dos copias).
- `hoy`, día de semana y fechas se calculan con aritmética de calendario sobre
  `YYYY-MM-DD` (como `validarFechaRecogida` en `flujos-puro.ts`), sin depender
  de la zona del servidor.

**B3 · I/O** en `lib/escolar/administracion/administracion.ts`:
`listarFranjas`, `crearFranja`, `borrarFranja` (borrado real: es configuración,
no historial), `listarDiasBloqueados(desde)`, `bloquearDia`, `desbloquearDia`,
`listarHuecosOcupados(desdeIso, hastaIso)` → `Set` de `"fecha hora"` locales
(citas `pendiente|aceptada` en el rango, convertidas con `fechaHoraLocal`).
Normaliza `time` de PostgREST (`"09:00:00"` → `"09:00"`).
`solicitarCita` recibe ya el `propuesta_at` calculado; si Postgres responde
`23505` devuelve `"Ese horario acaba de ocuparse. Elige otro."`.

**B4 · Actions** (`app/actions/administracion.ts`, sin `.from()`):
- `actionLeerAgendaCitas()` y `actionGuardarFranja(entrada)`,
  `actionBorrarFranja(id)`, `actionBloquearDia(entrada)`,
  `actionDesbloquearDia(fecha)` — todas `exigir("cita.gestionar")`. Entradas con
  esquema en `lib/validacion/esquemas-puro.ts` + `leerEntrada`, como
  `actionSolicitarConstancia`. `actionGuardarFranja` valida con `validarFranja`
  contra las existentes antes de insertar.
- `actionListarHuecosCita()` — `exigir("cita.solicitar")` → `{ ok, huecos,
  agendaPublicada: boolean }`.
- `actionSolicitarCita` cambia su entrada a `{ curp, motivo, fecha, hora }`
  (esquema nuevo). Tras capacidad y alcance: lee franjas, bloqueados y ocupados,
  `validarSolicitudCita`, y solo entonces `instanteDelPlantel(fecha, hora)` →
  `solicitarCita`. **El servidor decide; la lista del navegador es solo ayuda.**
- `actionListarCitasPropias(curp)`: además del alcance, filtra a esa CURP
  (que debe estar dentro del alcance; si no, `[]`).

**B5 · UI directivo** — archivo nuevo `app/components/agenda-citas-panel.tsx`
(`administracion-panel.tsx` ya tiene 516 líneas). Mismas piezas visuales y tokens
`--oc-*` que `administracion-panel.tsx` (copia `Panel`/`Boton`/`Campo`/`Aviso`
solo si no son exportables; preferible exportarlas). Contenido:
- **Horario de atención**: lunes→domingo, cada día con sus franjas
  («09:00–13:00 · citas de 30 min» + Quitar) y un formulario Día / Desde / Hasta /
  Duración / Añadir. Errores del servidor visibles.
- **Días sin atención**: lista de fechas futuras con motivo + Quitar, y
  formulario Fecha / Motivo / Bloquear.
- Una línea de estado arriba: «Agenda publicada: N huecos libres en los próximos
  30 días» o «Sin horario: alumnos y tutores no pueden pedir citas».
- En `Citas` de `administracion-panel.tsx`: el modo se decide por **igualdad**
  con el rótulo del mapa (exporta constantes `MODO_CONFIGURAR_CITAS`,
  `MODO_CITAS_PENDIENTES`, `MODO_CITAS_PROGRAMADAS` junto a `mapa-navegacion.ts`
  o en el puro), no con `includes`. «Configurar citas» monta `AgendaCitasPanel`.

**B6 · UI alumno/tutor** `sesiones-programadas-panel.tsx`:
- Quita el `datetime-local`. Carga `actionListarHuecosCita()`: un `<select>` de
  día (solo días con huecos, «lunes 6 de octubre») y otro de hora (los huecos de
  ese día). Botón Solicitar deshabilitado sin hueco elegido.
- `agendaPublicada === false` → aviso «La dirección todavía no ha publicado su
  horario de citas.» y formulario deshabilitado.
- Tras solicitar (o error de ocupado) recarga huecos y lista.
- Lista: `actionListarCitasPropias(curpAlumno)`.

### REGLAS
- La regla «¿se puede pedir este hueco?» existe UNA vez (B2). Ni la action ni la
  UI repiten condiciones.
- Sin agenda publicada nadie puede pedir cita (decisión: lo cerrado es lo seguro).
- Cambiar la agenda NO toca citas ya pedidas; el directivo las acepta o rechaza
  como hoy. No hay cancelación automática.
- El directivo NO queda limitado por su agenda al aceptar.

### SEGURIDAD
- Toda escritura de agenda exige `cita.gestionar`. Ninguna capacidad nueva en B.
- `fecha`/`hora` del navegador pasan por esquema + `validarSolicitudCita`; nunca
  se inserta un `propuesta_at` que venga del cliente.
- El índice único es la garantía final contra la doble reserva.

### COMPATIBILIDAD
- Si las tablas no existen aún (SQL sin correr), `actionLeerAgendaCitas` y
  `actionListarHuecosCita` devuelven un error legible («Falta crear la agenda de
  citas en la base: supabase/crear-agenda-citas.sql»), no una lista vacía que
  parezca «sin horario».
- La única cita existente queda intacta.

### RENDIMIENTO
- `actionListarHuecosCita`: 3 consultas fijas (franjas, bloqueados en rango,
  ocupados en rango). Sin N+1, sin bucle de consultas por día.

### LÍMITES (no tocar)
- `flujos-puro.ts` (máquina de estados de citas) — sin cambios.
- `calendario_escolar`, `periodos`, `lib/auth/exigir.ts`.
- Ningún umbral de `scripts/test-orden.mjs`.
- No ejecutar el SQL. No crear tabla de notificaciones.

### VALIDACIÓN
- Suite: casos nuevos en `scripts/test-uis-pendientes.mjs` para
  `agenda-citas-puro`: franja válida/solapada/no cabe; huecos de una franja
  09:00–10:00/30 → 09:00, 09:30; excluye bloqueados, ocupados, hoy y día 31;
  `validarSolicitudCita` rechaza cada caso con su mensaje y acepta lo que
  `huecosDisponibles` ofrece (propiedad: todo hueco ofrecido es válido);
  sin franjas → «sin agenda publicada».
- `npx tsc --noEmit` · `node scripts/test-orden.mjs` · `npm run gen:matriz` ·
  `npm run test:ci` · `next build`.
- `ESTADO-ACTUAL.md`: anota las dos tablas nuevas, la capacidad
  `reporte.ver_propios` y que el SQL está pendiente de ejecutar.

### INFORME
Por parte: archivos tocados, casos de suite añadidos (antes/después), salida de
`npm run test:ci`, y lo que NO pudiste verificar (navegador con sesión real).

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

---

## EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-01)

No lo ejecutó Cline: lo ejecutó Claude a pedido del responsable, auditando cada
paso contra `ORDEN.md`, `REGLAS_NO_HACER.md`, `INVARIANTES.md` y el CONTRATO.
La auditoría corrigió el propio prompt en estos puntos — quedan aquí para que el
próximo prompt no los repita:

| El prompt decía | Lo que se hizo | Por qué |
|---|---|---|
| `dia_semana smallint 1..7` (ISO) | `dia_semana text` con el vocabulario de `DIAS_SEMANA` | Es el de `horario_semanal` y `calendario.ts`: un segundo vocabulario de días sería otra fuente (R6) |
| Helpers de hora y día propios | Reutiliza `horaAMinutos`/`minutosAHora` (horario-semanal-puro) y `diaSemanaDesdeFecha` (calendario) | §11: revisar lo existente antes de crear |
| Panel nuevo `agenda-citas-panel.tsx`, «exportar las piezas si no son exportables» | La agenda va DENTRO de `administracion-panel.tsx` | Un archivo nuevo redeclaraba `Panel/Boton/Aviso` (C11, trinquete) o importaba en círculo; Configurar citas es una vista más de Citas |
| Constantes de modo «junto a mapa-navegacion o en el puro» | `vistaCitas()` en `lib/navegacion/contenido-directivo.ts`, con suite contra el mapa | Es donde vive la decisión «hueco → pieza» del directivo (precedente: `esModoConfiguracion`) |
| La action lee agenda, valida e inserta | `pedirCitaEnAgenda` en `lib/` hace las tres cosas | ORDEN §2: un `if` de negocio en la action va a `lib/` |
| (no lo pedía) | `scripts/diag-agenda-citas.mjs` y el pendiente `sql-agenda-citas` | El CONTRATO exige medición antes/después con el MISMO script, y el SQL sin ejecutar es un pendiente humano (ESTADO §6) |
| Bloque de CONTRATO «pegar aquí» | Pegado | Faltaba en la primera versión |

Medido: reportes — 1 en la base, anulado → 0 visibles. Agenda — tablas sin crear,
1 cita (rechazada), 0 vivas: el índice único se puede crear sin conflicto.

