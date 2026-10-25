# PROMPT X — Boleta generada en el navegador, activada por parcial

Redactado por Claude el 2026-10-24. Dominio: calificaciones → boleta. Peso según
`node scripts/diag-peso-cambio.mjs` sobre el cambio entero: **9/14 → Claude** (ESQUEMA +
IDENTIDAD). Por eso va en dos partes:

| Parte | Quién | Qué | Peso |
|---|---|---|---|
| **A** | Claude | SQL `crear-boletas-activacion.sql`, capacidad `boleta.activar`, clasificación de la tabla, matriz de permisos | esquema + auth |
| **B** | Cline | módulo puro, I/O, actions, pantallas, navegación, suite y diagnóstico | **3/14 → Cline** |

**Este prompt es la Parte B.** Precondición: la Parte A ya está en `main` y su SQL aplicado
(lo comprueba el paso 1 de MEDICIÓN). Si `boleta.activar` no existe en
`lib/auth/capacidades.ts` o la tabla `boletas_activacion` da 404, **para y avisa**.

---

## OBJETIVO

La subida manual de boletas desaparece. En su lugar:

1. El **directivo**, en **Grupos/Boleta › Boleta › Activación**, activa o desactiva a mano la
   boleta de un **parcial** (`periodos_evaluacion`) para **todo el plantel**, un **grado** o un
   **grupo**.
2. Con la boleta activada, el **alumno** y el **tutor** la ven en **Perfil › Boleta** (el
   apartado que hoy se llama «Estatus académico»). Se arma **en el navegador cada vez que se
   entra**, con los datos de ese momento: no se guarda ninguna boleta en la base.
3. El directivo consulta la boleta de cualquier alumno en **Grupos/Boleta › Boleta ›
   Consultar boleta de alumno** (grupo → alumno), esté activada o no.
4. **Administración escolar** ve la misma boleta en **Alumnos › Boleta**.

Es una **vista previa informativa**, antes de que recojan la boleta oficial: solo se ve en
pantalla, sin botón de imprimir y sin firma.

## CONTEXTO (presupuesto acotado — no leer nada más)

Generado con `node scripts/gen-contexto.mjs --tarea=crear lib/escolar/administracion app/actions app/components lib/navegacion app/components/oceano/contenido-directivo-oceano.tsx app/components/oceano/contenido-alumno-oceano.tsx`:

- **Cualquier cambio** → `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` · `docs/normativo/GLOSARIO.md`
- **Crear archivo/función/script** → + `docs/normativo/ORDEN.md`
- **Server Action nueva** → + `docs/sistema/MATRIZ-PERMISOS.md` (§3 y la entrada de §5)
- **Pieza visual / asset** → + `docs/sistema/MATRIZ-UX.md` §3 (R-UX1: lo visual sin dominio va en `app/components/ui/`)

Suite que ya nombra estos huecos: `scripts/test-rediseno-oceano.mjs` (navegación). Términos
del glosario: `periodos.id`, `periodos_evaluacion`, `grupo_materia_id`, `inscripciones_alumno`,
`PROFESORES.ID`, «ciclo operativo».

## ESTADO ACTUAL (verificado por Claude el 2026-10-24 — no re-investigar)

**Navegación.**
- `lib/navegacion/mapa-navegacion.ts:136` — `PERFIL_ALUMNO` tiene `act("estatus-academico", "Estatus académico")`. El tutor hereda los mismos apartados (`PERFIL_TUTOR`, `:149-153`).
- `lib/navegacion/contenido-alumno.ts:63` — `"perfil/estatus-academico": "perfil-registro-calificaciones"`: la tabla legacy del registro, servida por `contenido-alumno-oceano.tsx:710-755`.
- `lib/navegacion/mapa-navegacion.ts:221-228` — `GRUPOS_BOLETA`: `act("boleta", "Boleta", ["Descargar plantilla", "Previsualizar cambios"])` y `act("grupo", "Grupo")`.
- `lib/navegacion/contenido-directivo.ts:38-39` — `boleta` → `"boleta-grupo"`, `grupo` → `"grupo-visualizador"`. **Las dos piezas caen en el MISMO código** (`contenido-directivo-oceano.tsx:192-265`): las tarjetas de grupos que abren el registro legacy de la primera materia, con el aviso «la boleta consolidada del grupo todavía no tiene tabla propia».
- `lib/navegacion/contenido-administracion.ts:32-33` — `expediente/estatus-academico` → `perfil-registro-calificaciones`; `expediente/boleta` → `materias-calificacion`.
- `scripts/test-rediseno-oceano.mjs:768-770` exige que el directivo **NO** tenga el buscador de alumno en `grupos-boleta/boleta`: por eso la consulta va por grupo → alumno, no por el buscador.

**La constancia es el molde (copiar el patrón, no el archivo).**
- `lib/escolar/administracion/constancia-puro.ts` — `PLANTEL` (nombre, `cct`), `periodoSemestre(inicio, fin)` («16 de Febrero al 30 de Julio de 2026»), `tituloCarrera(carrera)` («TÉCNICO EN RECURSOS HUMANOS» para `RH`).
- `lib/escolar/administracion/constancia.ts` — compone `buscarAlumnoPorCurp`, `nombreCompletoAlumno`, `leerNumeroControl`, `resolverGrupoAlumno`; y `nombresDeAlumnos(supabase, curps)`.
- `app/components/constancia-estudios-vista-previa.tsx` — hoja en unidades `cqw` dentro de `[container-type:inline-size]`, imágenes con `<img loading="eager">` desde `CARPETA_DECORACIONES_PUBLIC`.

**Notas (modelo B).** `calificaciones(grupo_materia_id, curp, tipo, clave_columna, valor, updated_at)`, únicas por `(grupo_materia_id, curp, tipo, coalesce(clave_columna,''))`. **No llevan parcial:** el profesor vuelve a subir y el upsert pisa. Eso es lo que el responsable quiere: la boleta enseña **lo que hay ahora**, rotulado con el parcial que activó el directivo.
- `materiasDelAlumno(supabase, curp, soloActivas, grupoIds?)` — `lib/escolar/materia/calificaciones.ts:202` → `{ grupoMateriaId, nombre, nombreVisible, … }`.
- Datos reales: 451 filas, **una sola** materia con notas (INGLES); tipos `actividad` (410) y `promedio` (41, clave «Promedio Final»), **escala 0–10** (6.3–8.5). Ninguna `parcial` ni `final`.

**Parciales.** `resolverOperativoConParciales(supabase)` — `lib/escolar/ciclo/evaluaciones.ts:425` → `{ periodoId, periodoNombre, parciales }` (solo activos). Hoy: P1 31 ago–25 sep, P2 28 sep–6 nov, P3 9 nov–11 dic (2026).

**Asistencia por parcial (ya existe, no abrir otra vía — R6).** La composición de `actionObtenerEstadosAsistenciaAlumno` (`app/actions/asistencias.ts:344-416`): `resolverIdentidadAlumnoInscripcion` (`asistencia/asistencias.ts:137`) → `obtenerEstadosAsistenciaAlumno` (`asistencia/asistencia-estados.ts:103`, con `profesorId: null`) → `resumenAsistenciaPorParcial` (`asistencia/asistencia-parcial.ts:188`). El dato es `ResumenPorParcial.porcentaje` del parcial; sin `clasesRegistradas` no hay porcentaje (`parcialTieneRegistro`, `asistencia-tabular.ts:45`).

**Grupos del ciclo.** `listarGruposPeriodoAdmin(supabase, periodoId)` — `catalogo/inscripciones-borrador.ts:38` → `{ id, grado, grupo, carreraClave, activo }`. 24 grupos; grados `1RO…6TO`; **la letra se repite entre carreras** (dos «2DO A»): toda etiqueta de grupo lleva la carrera. Alumnos de un grupo: `obtenerCurpsInscritasGrupo(supabase, grupoId)` (`asistencia/asistencia-configuracion.ts:186`) + `nombresDeAlumnos`.

**Alumnos.** 472; **471 sin `numero_control`**.

**Logo.** `public/decoraciones-imagenes/SEPLogo.png`: 364×160, **10.6 KB**, ya lo descarga la portada (`app/page.tsx:89`). `SepConstanciaLogo.png` pesa 110 KB a 2616×1072. Se usa **`SEPLogo.png`**; no se sube ni se reescala ningún archivo.

**Parte A (Claude, ya en `main` antes de empezar):**
- `supabase/crear-boletas-activacion.sql` — tabla `boletas_activacion` y RPC `activar_boleta` (forma abajo).
- `lib/auth/capacidades.ts` — `boleta.activar`; `lib/auth/permisos.ts` — solo `directivo`.
- `lib/escolar/tables.ts` — `TABLA_BOLETAS_ACTIVACION = "boletas_activacion"`; clasificada en `lib/escolar/materia/tablas-sistema.ts` (C15).

```
boletas_activacion(
  id uuid pk, periodo_id uuid → periodos, evaluacion_id uuid → periodos_evaluacion,
  alcance text in ('plantel','grado','grupo'), grado text null, grupo_id uuid null → grupos,
  activa bool, activada_por bigint, activada_en timestamptz,
  desactivada_por bigint null, desactivada_en timestamptz null)
-- CHECK: plantel ⇒ grado y grupo_id null · grado ⇒ grado, sin grupo · grupo ⇒ grupo_id, sin grado
-- ÚNICO parcial: una sola fila activa por (periodo_id, alcance, grado, grupo_id)
-- activar_boleta(p_periodo, p_evaluacion, p_alcance, p_grado, p_grupo, p_por) → uuid
--   valida parcial∈periodo y grupo∈periodo; desactiva la vigente del MISMO alcance e
--   inserta la nueva, en una transacción. Desactivar = UPDATE activa=false (no se borra).
```

## DECISIONES TOMADAS (no las reabras)

1. **Qué nota sale por materia.** La fila `tipo = 'promedio'` de ese alumno en esa `grupo_materia_id` (lo que subió el profesor). Si hay más de una (encabezados viejos), la de `updated_at` más reciente. **No se calcula** nada a partir de actividades, ni se usa `final`. Sin fila → **«Sin calificar»** (la boleta se muestra igual: así se prueba sin notas).
2. **Redondeo y escala (0–10).** `r = Math.floor(Math.round(v * 100) / 100 + 0.5)` (0.5 o más sube, por debajo baja) y luego **`max(5, r)`**: nunca sale menos de 5, y **no se marca** reprobada ni se pinta en rojo. Un valor fuera de 0–10 (p. ej. un 85 en escala de 100) sale **«Revisar»** y no cuenta en el promedio general: no se convierte de escala.
3. **Promedio general.** Media de las calificaciones **ya mostradas** (tras el redondeo y el piso de 5) de las materias que tienen una; se redondea con la misma regla a entero. Constante `DECIMALES_PROMEDIO_GENERAL = 0` en el módulo puro, para cambiarla en un sitio. Sin ninguna → «Sin calificar».
4. **Asistencia.** Una fila más bajo el promedio general: «Asistencia del parcial: 93 %» (`ResumenPorParcial.porcentaje` del parcial activado). Sin clases registradas → «Sin registro». Nada más por materia: ni faltas ni profesor.
5. **Qué activación le toca a un alumno.** Entre las vigentes del ciclo operativo, gana la **más específica** que lo cubre: `grupo` (su `grupos.id`) > `grado` (su `grupos.grado`) > `plantel`; empate → la de `activada_en` más reciente. Ninguna → alumno y tutor ven «La boleta de este parcial aún no está disponible». Lo decide una función pura.
6. **Quién ve qué** (`exigir("calificacion.ver")` + alcance, lista BLANCA como en `calificaciones-normalizadas.ts`):
   - `alumno`, `tutor` → `resolverAccesoAlumno`; solo con activación (decisión 5); el parcial **lo pone la activación**, nunca el cliente.
   - `directivo`, `administracion` → cualquier CURP; ven la boleta **aunque no esté activada** y pueden elegir el parcial (por defecto: el de la activación que le aplica; si no hay, el que contiene la fecha de hoy; si no, el primero). La respuesta dice si está activada para ese alumno.
   - cualquier otro rol (incluido `maestro`) → nada.
   - La action devuelve `puedeElegirParcial: boolean`; la pantalla no decide permisos.
7. **Activar / desactivar.** `exigir("boleta.activar")`. El cliente manda `evaluacionId`, `alcance` y `grado` o `grupoId`; **el servidor pone `periodoId`** (`resolverOperativoConParciales`) y `p_por = Number(sesion.profesorId)` (`PROFESORES.ID`). Activar = RPC `activar_boleta`; desactivar = UPDATE de la fila (`activa=false`, `desactivada_*`). Validación de forma en `lib/validacion/esquemas-puro.ts` + `leerEntrada`; la coherencia alcance↔campos, en el módulo puro.
8. **Datos de la hoja** (orden de arriba abajo, carta **horizontal**, `aspect-ratio: 11 / 8.5`):
   - esquina superior izquierda `SEPLogo.png`; a su derecha «BOLETA DE CALIFICACIONES», `PLANTEL.nombre` y «C.C.T. {PLANTEL.cct}»;
   - «{parcial.nombre} · del 28 de Septiembre al 6 de Noviembre de 2026» (`periodoSemestre` con las fechas del parcial, precedido de «del »);
   - Nombre completo · CURP · No. de control (**«Sin asignar»** si falta, no bloquea) · Grado y grupo («2DO A») · Carrera (`tituloCarrera`, «Sin carrera» si falta);
   - tabla **Materia | Calificación**, materias por nombre visible (`nombreVisible ?? nombre`, orden `localeCompare(…, "es")`), y debajo Promedio general y Asistencia del parcial;
   - bajo la tabla: **«Documento informativo, sin validez oficial.»** Sin firma, sin sello, sin director.
9. **Solo pantalla.** Sin botón de imprimir. `@media print` oculta la hoja y deja «La boleta solo se consulta en pantalla.» Se lee **cada vez que se monta** el apartado (sin caché en el cliente).
10. **Zoom.** La hoja vive en un visor genérico con −, +, «Ajustar» (100 % = ancho del contenedor; pasos hasta 250 %) y desplazamiento propio. Es una pieza sin dominio → `app/components/ui/visor-con-zoom.tsx` (R-UX1). La página no gana scroll horizontal: lo tiene el visor.
11. **Navegación.**
    - Alumno/tutor: `act("estatus-academico", "Estatus académico")` → **`act("boleta", "Boleta")`**, en el mismo sitio. `contenido-alumno.ts`: pieza nueva `"perfil-boleta"`, hueco `"perfil/boleta"`; sale `"perfil/estatus-academico"`. El tipo `"perfil-registro-calificaciones"` **se queda** (lo usa Administración).
    - Administración escolar: `"expediente/boleta"` → `alumno("perfil-boleta")`. `expediente/estatus-academico` **no se toca**.
    - Directivo: `act("boleta", "Boleta", ["Activación", "Consultar boleta de alumno"])`. `contenido-directivo.ts`: `"boleta-grupo"` se sustituye por `"boletas-directivo"`; constantes `MODO_ACTIVACION_BOLETAS` / `MODO_CONSULTAR_BOLETA` y `vistaBoletas(modo)` (por IGUALDAD, como `vistaCitas`; sin modo → activación).
    - **El apartado «Grupo» se queda** con su vista actual; solo cambian sus textos: «· ver su registro» en vez de «· sube su boleta», y el aviso deja de hablar de «boleta consolidada».
12. **Pantalla de activación.** Arriba, las activaciones **vigentes** («Parcial 2 · Todo el plantel · desde 24/10/2026», con «Desactivar»). Debajo el formulario: parcial (select) · alcance (Todo el plantel / Grado / Grupo) · grado o grupo según el alcance (etiqueta de grupo «2DO A · RH») · «Activar». Al activar un alcance que ya tiene una vigente, la pantalla avisa de que **la sustituye**. Mensajes de error del servidor en castellano.
13. **Consultar boleta de alumno.** Select de grupo (mismas etiquetas) → lista de alumnos del grupo (nombre) → la boleta con selector de parcial y la marca «Activada para este alumno: sí/no».

## ARCHIVOS

| Archivo | Qué |
|---|---|
| `lib/escolar/administracion/boleta-puro.ts` (nuevo) | **Puro.** `calificacionBoleta(v)`, `promedioGeneral(vals)`, `textoAsistencia(r)`, `duracionParcial(p)`, `activacionQueAplica(activas, { grado, grupoId })`, `validarActivacion(e)`, `etiquetaActivacion(a, grupos)`, `armarBoleta(datos)` → `BoletaArmada`; constantes `TITULO_BOLETA`, `LEYENDA_BOLETA`, `DECIMALES_PROMEDIO_GENERAL`. Importa de `./constancia-puro.ts` (`PLANTEL`, `periodoSemestre`, `tituloCarrera`); no los copia. |
| `lib/escolar/administracion/boleta.ts` (nuevo) | I/O. `contextoActivacionBoletas`, `leerActivacionesVigentes`, `activarBoleta` (RPC), `desactivarBoleta`, `alumnosDeGrupoParaBoleta`, `datosBoletaDeAlumno(supabase, curp, { evaluacionId, exigirActivacion })` con las funciones del ESTADO ACTUAL. Imports relativos con extensión. |
| `lib/escolar/materia/calificaciones.ts` | `promediosDeAlumno(supabase, curp, grupoMateriaIds)` → `Map<grupoMateriaId, number \| null>`: **una** consulta (`.in`, `tipo = 'promedio'`, `updated_at` desc). |
| `lib/validacion/esquemas-puro.ts` | `esquemaActivarBoleta`, `esquemaDesactivarBoleta`, `esquemaAlumnosDeGrupoBoleta`, `esquemaBoletaAlumno`. |
| `app/actions/boletas.ts` (nuevo) | `"use server"`: `actionBoletaAlumno`, `actionContextoActivacionBoletas`, `actionActivarBoleta`, `actionDesactivarBoleta`, `actionAlumnosDeGrupoBoleta`. exigir → `leerEntrada` → alcance (decisión 6) → delegar. Sin `.from()`, sin reexportar (C14). |
| `app/components/ui/visor-con-zoom.tsx` (nuevo) | Decisión 10. Sin dominio. |
| `app/components/boleta-vista.tsx` (nuevo) | `"use client"`. `HojaBoleta` (dibuja `BoletaArmada`, unidades `cqw`, colores de documento como la constancia) y `BoletaAlumnoPanel({ curp })`: llama a `actionBoletaAlumno` al montar; con `puedeElegirParcial` pinta el selector. |
| `app/components/boletas-activacion-panel.tsx` (nuevo) | `"use client"`. Decisiones 12 y 13 según `vistaBoletas(modo)`. Tokens `var(--oc-*)`. |
| `lib/navegacion/mapa-navegacion.ts` · `contenido-alumno.ts` · `contenido-directivo.ts` · `contenido-administracion.ts` | Decisión 11. |
| `app/components/oceano/contenido-alumno-oceano.tsx` | Rama `"perfil-boleta"` → `<BoletaAlumnoPanel curp={curp} />`. |
| `app/components/oceano/contenido-directivo-oceano.tsx` | Rama `"boletas-directivo"` → `<BoletasActivacionPanel modo={modo} />`; textos de «Grupo» (decisión 11). |
| `scripts/test-boleta.mjs` (nuevo) | Suite del módulo puro (la recoge `correr-todas-las-suites.mjs`). |
| `scripts/test-rediseno-oceano.mjs` | Solo lo que cambia de nombre: `perfil/boleta`, `boletas-directivo`, modos nuevos. Ningún invariante se afloja. |
| `scripts/diag-boletas.mjs` (nuevo) | **LEE** (solo GET): parciales del operativo; activaciones vigentes por alcance; materias con al menos un `promedio`; alumnos sin `numero_control`. Sin CURPs ni nombres. Fila en `scripts/README.md` con `LEE(red)`. |
| `docs/sistema/MATRIZ-PERMISOS.md` | `npm run gen:matriz` (actions nuevas). |
| `ESTADO-ACTUAL.md` | Una línea: boleta generada, activada por parcial. Tope de ~150 líneas. |

## MEDICIÓN

1. **Precondición:** `boleta.activar` está en `lib/auth/capacidades.ts` y `GET /rest/v1/boletas_activacion?select=id&limit=1` responde 200. Si no, para.
2. Crea primero `scripts/diag-boletas.mjs` (lo único que se escribe antes de medir), córrelo y pega la salida. Debe decir: 3 parciales · 0 activaciones · 1 materia con promedio · 471 sin número de control.
3. Al terminar, vuelve a correrlo: **cifras idénticas**. No actives boletas de prueba contra la base: la prueba con sesión la hace el responsable.

## RESULTADO ESPERADO

- Directivo: Grupos/Boleta › Boleta abre en **Activación**; «Descargar plantilla» y «Previsualizar cambios» ya no existen. «Grupo» sigue igual con los textos nuevos.
- Alumno y tutor: **Perfil › Boleta** en lugar de «Estatus académico»; sin activación, el aviso; con activación, la hoja.
- Administración escolar: Alumnos › Boleta muestra la hoja nueva con selector de parcial.
- La suite nueva cubre como mínimo: 7.5→8 · 7.49→7 · 8.45→8 · 6.5→7 · 4.2→5 · 0→5 · 10→10 · null→«Sin calificar» · 10.5 y 85→«Revisar»; promedio [8, 7, sin nota] → 8 y [] → «Sin calificar»; precedencia grupo > grado > plantel, empate por fecha, una activación de OTRO grupo no aplica; `numeroControl` null → «Sin asignar»; `RH` → «TÉCNICO EN RECURSOS HUMANOS»; la duración del parcial; `validarActivacion` rechaza «grado» sin grado, «grupo» con grado y «plantel» con grupo.

## REGLAS / SEGURIDAD / RENDIMIENTO

- El cliente **nunca** manda `periodoId`, ni el parcial de un alumno o tutor.
- Una CURP ajena en `actionBoletaAlumno` con sesión de alumno → nada (lo decide `resolverAccesoAlumno`).
- `promediosDeAlumno` es UNA consulta, no una por materia. Las lecturas independientes de `datosBoletaDeAlumno` van en `Promise.all`.
- Sin `next/image` en la hoja (ver el comentario de `ImagenHoja` en la constancia).

## ALCANCE

**SÍ:** lo de la tabla ARCHIVOS.
**NO:** `supabase/`, `lib/auth/` (eso es la Parte A); la subida del profesor y `calificaciones-normalizadas.ts`; el apartado «Grupo» salvo sus textos; `expediente/estatus-academico`; la pieza `perfil-registro-calificaciones`; `actionObtenerVistaRegistro`; los manuales de `things/`. No borres la pieza legacy ni su action aunque queden con menos usos.

## VALIDACIÓN

```bash
node scripts/test-boleta.mjs
node scripts/test-rediseno-oceano.mjs
node scripts/test-permisos.mjs
node scripts/test-orden.mjs
npm run test:ci
```

## INFORME

Las 7 secciones de `ORDEN.md` §6.10: qué se hizo · quién lo ejecutó y qué pudo y no pudo hacer · cómo se ejecutó y se midió (antes → después) · qué normas respetó (CONTRATO §2) · veredicto frente a la filosofía y la arquitectura · desviaciones y decisiones propias · lo no verificado (como mínimo: ninguna activación real, ninguna sesión de alumno o tutor).

## CONTRATO

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
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

---

## EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-24)

No lo ejecutó Cline: el usuario pidió «ejecuta tú todo… audita para corregir errores que se te
hayan pasado». Lo implementó Claude: Parte A en `e56482e`, Parte B en `e899f3a`. Informe:
`docs/historial/informes/INFORME-PROMPT-X-BOLETA-GENERADA.md`.

Correcciones que la ejecución le hizo a este prompt (para el siguiente que se redacte):

1. **«`expediente/estatus-academico` no se toca» era incompatible con la decisión 11.** Al quitar
   `perfil/estatus-academico` del alumno, `test-rediseno-oceano` falló: Administración escolar
   enseña las MISMAS piezas que ve el alumno, y esa ya no la ve. Se retiró el apartado; queda
   «Boleta». Lección: antes de dejar un hueco de Administración «sin tocar», comprobar que su
   pieza sigue en `contenido-alumno.ts`.
2. **Revisar → confirmar (CONTRATO §2, «Datos») tampoco estaba en este prompt**, igual que en el
   W. Se añadió: Activar → Confirmar activación. Desactivar ya pedía confirmación.
3. **El SQL no se pudo aplicar desde el agente**: el clasificador de seguridad bloqueó
   `execute_sql`. Va a `pendientes.json` (`sql-boletas-activacion`). El código tolera la tabla
   ausente (PGRST205/PGRST202): la consulta del personal funciona, activar avisa.
4. **La familia veía errores técnicos** (sin ciclo operativo, inscripción rota): ahora ve «aún no
   está disponible»; el personal sigue viendo el motivo.
5. **`datosBoletaDeAlumno(…, { exigirActivacion })` se implementó como `boletaDeAlumno(…, { alcance })`**:
   el alcance sale del `modo` que ya devuelve `resolverAccesoAlumno`, con `alcanceVistaBoleta`
   (lista blanca, pura y con suite). Así la action no compara roles.
6. **`RUMBO.md` llevaba 11 commits de desfase antes de empezar** y tumbaba `test:ci`. Medir el CI
   antes de tocar nada lo habría separado del cambio.
7. **Python en modo texto convierte LF en CRLF en Windows.** Las ediciones se hicieron con Node
   conservando el fin de línea de cada archivo.
8. **Verificación visual sin sesión**: `/oceano` exige iniciar sesión y solo hay cuentas reales.
   `HojaBoleta` se transpiló con `typescript` y se renderizó con `react-dom/server` a un HTML del
   scratchpad, servido por una configuración temporal del `launch.json` de `web/` (que no está en
   git), ya retirada. El armado real se ejecutó contra la base en solo lectura con
   `node --conditions=react-server` (hace falta por `server-only`).
9. **El estado medido se mantuvo**: `2026-2027` · 3 parciales · sin tabla · 1 materia con promedio
   · 41 filas · 471 de 472 sin número de control, antes y después.
