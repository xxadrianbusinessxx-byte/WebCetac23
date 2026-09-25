# Matriz de permisos — línea base y destino

**Pasos 1 y 2 de la centralización de permisos** (`docs/normativo/ORDEN.md`, plan de roles).
Este documento tiene dos trabajos:

1. **Congelar cómo está hoy.** Las Server Actions con la guardia que aplican, extraídas
   del código el **2026-09-06**, no de memoria. Es la línea base contra la que se compara
   cada commit de la migración: si una action gana o pierde permisos sin querer, se ve en
   el diff de este archivo. El **PROMPT-2** ya migró las 138 actions a `exigir(capacidad)`
   (la §5 queda generada con `exigir:` como guardia HOY); la matriz HOY vive en
   `lib/auth/permisos.ts` y la verifica `scripts/test-permisos.mjs`.
2. **Recoger el destino.** Las columnas de rol de la §4 son las que hay que rellenar
   para decidir qué puede cada quien —incluido el nuevo rol **técnico**— antes de
   aplicar el cambio (prompt 3).

> Mientras la migración no termine, **este documento manda sobre el código**: si no
> coinciden, el código está mal migrado.

---

## 1. Por qué capacidades y no roles

Hoy el código pregunta 230 veces por el rol, repartido en 39 archivos, 20 de ellos
en `app/actions/`. Añadir un rol significa tocarlos todos; mover una atribución de
directivo a técnico, otra vez todos.

El destino es que el código **nunca** vuelva a preguntar por el rol:

```ts
if (sesion.rol !== "directivo") return { ok: false, error: "..." }  // hoy, ×230
exigir(sesion, "asignacion.editar")                                  // destino
```

Quién puede qué deja de estar repartido y pasa a ser **una tabla en un módulo puro**,
con su suite. Mover una capacidad entre roles es editar una línea.

Las capacidades gobiernan **las dos caras**: el servidor (la action rechaza) y la UI
(el botón o la pestaña no se pinta). La misma función `puede()` en ambos lados, así
no puede pasar que se vea un botón que luego el servidor rechaza, ni al revés.

## 2. Cómo leer la columna «Guardia hoy»

| Valor | Significa |
|---|---|
| `solo directivo` | Rechaza si `sesion.rol` no es ese. Es la guardia dominante: **68 actions**. |
| `solo directivo/maestro` | Acepta cualquiera de los dos. |
| `sesion (cualquier rol)` | Exige sesión válida, sin restringir rol. Decisión deliberada en lecturas de calendario. |
| `esDirectivo` | Helper local de `documentos.ts`, sobre `sesion.rol`. |
| `nivelAccesoProfesor` | Filtro adicional por alcance del profesor. Se conserva tal cual. |
| `accesoAlumno` | `resolverAccesoAlumno` / `autorizarEscrituraEtiquetas`: decide sobre **qué alumno**, no sobre el rol. Ortogonal a la capacidad y se mantiene. |
| `(delega)` | La action no lee la sesión, pero llama a otra que sí. **Verificado uno a uno.** |
| `**SIN SESION**` | No lee la sesión ni delega en algo que la lea. Ver §5. |

## 3. Alcance actual por rol

La matriz implementada vive en `lib/auth/permisos.ts` y la verifica
`scripts/test-permisos.mjs`. Tras el **PROMPT-3** (2026-09-06) eran 5 roles; desde el
2026-09-24 son **6**, con **Administración escolar**. Cifras medidas el 2026-09-24 con
`matrizHoy()` (las de 2026-09-06 eran 32 · 44 · 24 · 12 · 8; crecieron con las UIs
pendientes del 17-09):

| Rol | Capacidades en la matriz (sin públicas) | Cómo entra |
|---|---|---|
| **directivo** | 44 (conserva lectura y operación diaria) | `Permisos = 'Directivo'` |
| **tecnico** | 47 (configuración: ciclo, catálogo, asignaciones, roster, tutores, credenciales) | `Permisos = 'Tecnico'` |
| **maestro** | 27 | `Permisos = 'Profesor'` |
| **tutor** | 17 | Tabla `tutores` |
| **alumno** | 14 | Tabla `ALUMNOS` |
| **administracion** | 26 (expediente de cualquier alumno, sus datos y su número de control, tutores, reportes, constancias, documentos, mensajes) | `Permisos = 'Administracion'` |

Directivo ya no es el rol-comodín de configuración: la §4 (recorte T5) le deja la
lectura (`materia.ver_catalogo`, `semestre.ver`, `ciclo.ver_operativo`) y la
operación diaria (justificaciones, asistencia, calificaciones, documentos), y le
quita la administración del ciclo, el catálogo (editar/activar), asignaciones,
roster, tutores y calendario — todo eso pasa al rol técnico.

---

## 4. La matriz — IMPLEMENTADA (PROMPT-3, 2026-09-06)

62 capacidades cubren las 138 Server Actions activas. Esta tabla es la matriz
**implementada**: `lib/auth/permisos.ts` y `scripts/test-permisos.mjs` la
verifican contra el código (sección «Código ⇄ §4 (los 6 roles)»). Se regenera
con `node scripts/gen-seccion4.mjs` si la matriz cambia.

> **PROMPT-3 ejecutado (2026-09-06):** se creó el rol **técnico** (`Permisos =
> 'Tecnico'`) y se aplicó el recorte de la §4 a **directivo** (T5), que era el
> único paso que quita permisos. Decisión del directivo sobre las columnas no
> descritas en T5: **maestro/tutor/alumno quedan como estaban (HOY)** — la §4
> original dibujaba para M/T/A algunos cambios que este prompt no autoriza (p.
> ej. `evaluacion.ver` y `justificacion.resolver` para maestro, o quitar
> `alumno.editar_datos_personales`/`editar_etiquetas` al tutor y
> `justificacion.solicitar` al maestro). El delta entre la §4 redactada y lo
> implementado queda documentado en
> `docs/historial/informes/INFORME-PROMPT-3-ROL-TECNICO.md`; la tabla siguiente
> refleja la realidad del código (HOY + directivo recortado + rol técnico).

Leyenda de roles: **D** directivo · **M** maestro · **Tec** técnico · **T** tutor · **A** alumno

Leyenda de celdas — **esta notación es normativa**, la matriz implementada se lee de aquí:

| Celda | Significado |
|---|---|
| `✅` | El rol **tiene** la capacidad. |
| `X` | El rol **no** la tiene. La action la rechaza y la UI no se pinta. |
| `público` | No requiere sesión. Hoy solo `portada.ver`. |
| vacío | **Sin decidir.** No debe quedar ninguna al implementar. |

| Capacidad | Qué habilita | D | M | Tec | T | A | AE |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `ciclo.ver` | Listar ciclos y su contexto (7 actions) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ciclo.crear` | Crear ciclo, con o sin contexto | X | X | ✅ | X | X | X |
| `ciclo.editar` | Cambiar nombre y rango | X | X | ✅ | X | X | X |
| `ciclo.activar` | Marcar el ciclo operativo | X | X | ✅ | X | X | X |
| `ciclo.eliminar` | Borrar ciclo en cascada + su diagnóstico | X | X | ✅ | X | X | X |
| `ciclo.clonar_contexto` | Clonar contexto académico, cargar materias del catálogo | X | X | ✅ | X | X | X |
| `ciclo.reparar_tabla_legacy` | Reparar el puente `tabla_legacy` | X | X | ✅ | X | X | X |
| `ciclo.borrar_datos` | **PROMPT-4/T4**: deshacer los datos de un paso del configurador (contexto/calendario/horario/roster/evaluaciones) sin borrar el ciclo | X | X | ✅ | X | X | X |
| `calendario.ver` | Ver días del ciclo | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `calendario.editar` | Establecer base, guardar y borrar días (7 actions) | X | X | ✅ | X | X | X |
| `evaluacion.ver` | Ver parciales | X | X | ✅ | X | X | X |
| `evaluacion.editar` | Crear y activar parciales | X | X | ✅ | X | X | X |
| `materia.ver_catalogo` | Listar materias y catálogo (4 actions) | ✅ | ✅ | ✅ | X | X | X |
| `materia.editar_alias` | Editar el nombre visible | X | X | ✅ | X | X | X |
| `materia.activar_desactivar` | Activar/desactivar materia del ciclo | X | X | ✅ | X | X | X |
| `materia.mapear_columnas` | Mapear columnas y pesos de actividades | ✅ | ✅ | X | X | X | X |
| `materia.descargar_plantilla` | Descargar plantilla de materia | ✅ | ✅ | X | X | X | X |
| `carga_academica.aplicar` | Previsualizar y aplicar carga académica | X | X | ✅ | X | X | X |
| `inscripcion.ver` | Ver grupos e inscripciones del periodo (4 actions) | X | X | ✅ | X | X | X |
| `inscripcion.editar` | Inscribir alumno en el ciclo | X | X | ✅ | X | X | X |
| `ciclo.ver_contexto` | Leer el contexto académico del configurador (nace en T2) | X | X | ✅ | X | X | X |
| `ciclo.ver_operativo` | **Saber cuál es el ciclo operativo ahora** (nace en T2). No se mueve: de ella depende toda la subida de asistencia | ✅ | ✅ | ✅ | X | X | X |
| `horario.descargar_plantilla` | Bajar la plantilla de horario (nace en T2) | ✅ | ✅ | ✅ | X | X | X |
| `semestre.ver` | Ver oferta de semestres | ✅ | X | ✅ | X | X | X |
| `semestre.activar` | Activar/desactivar semestre por grado | X | X | ✅ | X | X | X |
| `horario.importar` | Importar horario desde Excel y su plantilla | X | X | ✅ | X | X | X |
| `horario.ver_grupo` | Ver horario de un grupo | ✅ | ✅ | X | X | X | X |
| `horario.ver_alumno` | Ver horario de un alumno | ✅ | ✅ | X | ✅ | ✅ | ✅ |
| `asistencia.subir` | Plantilla, previsualizar y confirmar asistencia | ✅ | ✅ | X | X | X | X |
| `asistencia.anular` | Anular asistencia ya subida | ✅ | ✅ | X | X | X | X |
| `asistencia.ver_grupo` | Ver asistencia de un grupo | ✅ | ✅ | X | X | X | X |
| `asistencia.ver_alumno` | Ver asistencia de un alumno | ✅ | ✅ | X | ✅ | ✅ | ✅ |
| `justificacion.solicitar` | Pedir justificación (3 actions) | ✅ | ✅ | X | ✅ | ✅ | X |
| `justificacion.ver_propias` | Ver las propias y su hilo (5 actions) | ✅ | ✅ | X | ✅ | ✅ | ✅ |
| `justificacion.resolver` | Aprobar o rechazar | ✅ | X | X | X | X | X |
| `justificacion.ver_todas` | Pendientes e historial completo | ✅ | X | X | X | X | X |
| `alumno.ver_perfil` | Ver perfil y buscar alumno | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `alumno.editar_datos_personales` | Campos personales, comentario, foto | ✅ | X | ✅ | ✅ | X | ✅ |
| `alumno.editar_etiquetas` | Etiquetas personales y dinámicas (6 actions) | ✅ | X | ✅ | ✅ | X | ✅ |
| `alumno.editar_estatus` | Estatus académico del alumno | ✅ | X | ✅ | X | X | ✅ |
| `alumno.comentar` | Comentario del directivo sobre el alumno | ✅ | ✅ | X | X | X | X |
| `alumno.importar_estatus` | Importar promedios/reprobadas masivo | X | X | ✅ | X | X | X |
| `alumno.cargar_roster` | Sincronizar alumnos desde archivo | X | X | ✅ | X | X | X |
| `alumno.borrar_roster` | **PROMPT-4/T3**: sacar a un alumno del roster del ciclo (previsualizar→confirmar; no borra de `ALUMNOS`) | X | X | ✅ | X | X | X |
| `alumno.ver_expediente` | **2026-09-24**: buscar a CUALQUIER alumno por nombre o CURP y abrir su expediente (Administración escolar) | X | X | X | X | X | ✅ |
| `alumno.editar_numero_control` | **2026-09-24**: capturar o corregir el número de control (matrícula) del alumno, el que va en la constancia de estudios | X | X | X | X | X | ✅ |
| `profesor.cambiar_clave_propia` | Cambiar la propia clave de acceso | ✅ | ✅ | ✅ | X | X | ✅ |
| `profesor.ver_credenciales_acceso` | Ver/reponer claves de **inicio de sesión** | X | X | ✅ | X | X | X |
| `profesor.forzar_cambio_clave` | Obligar a cambiar clave en el próximo acceso | X | X | ✅ | X | X | X |
| `tutor.ver_lista` | Listar tutores y sus credenciales | X | X | ✅ | X | X | ✅ |
| `tutor.crear` | Crear tutor, consolidar hermanos | X | X | ✅ | X | X | ✅ |
| `tutor.generar_automaticos` | Generación masiva de tutores | X | X | ✅ | X | X | ✅ |
| `tutor.ver_propio` | Ver sus datos y sus alumnos (4 actions) | ✅ | X | X | ✅ | X | X |
| `tutor.cambiar_credenciales_propias` | Cambiar su propia clave | ✅ | X | ✅ | ✅ | X | X |
| `documento.ver` | Ver y descargar documentos (3 actions) | ✅ | ✅ | ✅ | X | X | ✅ |
| `documento.subir` | Subir documento | ✅ | ✅ | ✅ | X | X | ✅ |
| `documento.eliminar` | Eliminar documento | ✅ | ✅ | ✅ | X | X | ✅ |
| `documento.gestionar_carpetas` | Crear, renombrar, eliminar carpetas | ✅ | X | ✅ | X | X | ✅ |
| `documento.asignar_permisos` | Dar y quitar acceso a profesores | ✅ | X | ✅ | X | X | ✅ |
| `calificacion.ver` | Ver materia, registro y boleta (6 actions) | ✅ | ✅ | X | ✅ | ✅ | ✅ |
| `calificacion.subir` | Subir Excel de materia y registro (4 actions) | ✅ | ✅ | X | X | X | X |
| `calificacion.eliminar` | Eliminar calificaciones de una materia | ✅ | ✅ | X | X | X | X |
| `noticia.publicar` | Publicar noticia de portada | ✅ | X | ✅ | X | X | X |
| `portada.ver` | Alumnos estrella y noticias de inicio | público | público | público | público | público | público |
| `actividad.ver` | Ver las actividades (tareas) de una materia y su estado. El alcance —qué materias— lo resuelve la action, no la capacidad. | ✅ | ✅ | X | ✅ | ✅ | X |
| `actividad.editar` | Crear, editar y calificar actividades de una materia. | ✅ | ✅ | X | X | X | X |
| `actividad.entregar` | Que el ALUMNO suba su entrega. Separada de `editar` a propósito: entregar no es gestionar. | X | X | X | X | ✅ | X |
| `reporte.ver` | Ver los reportes disciplinarios de un grupo. | ✅ | X | X | X | X | ✅ |
| `reporte.crear` | Levantar un reporte disciplinario sobre un alumno. | ✅ | X | X | X | X | ✅ |
| `reporte.anular` | Anular un reporte ya levantado. Va aparte de `crear` porque toca el historial de un alumno. | ✅ | X | X | X | X | ✅ |
| `cita.ver_propias` | Ver las citas propias (alumno) o las del vinculado (tutor). | X | X | X | ✅ | ✅ | X |
| `cita.solicitar` | Pedir una cita. | X | X | X | ✅ | ✅ | X |
| `cita.gestionar` | Aceptar, rechazar y cerrar citas. | ✅ | X | X | X | X | X |
| `constancia.solicitar` | Pedir una constancia. | X | X | X | ✅ | ✅ | X |
| `constancia.gestionar` | Resolver solicitudes de constancia y adjuntar el documento emitido. | ✅ | X | X | X | X | ✅ |
| `buzon.enviar` | Escribir una queja o comentario a la dirección. | X | X | X | ✅ | ✅ | X |
| `buzon.ver` | Leer el buzón y marcar atendido. | ✅ | X | X | X | X | X |
| `mensaje_interno.usar` | Mensajería privada entre personal (directivo, técnico, profesor). NO es el chat global retirado, que era alumno↔profesor. | ✅ | ✅ | ✅ | X | X | ✅ |

### Capacidades que aún no existen y las añade el nuevo diseño

| Capacidad | Para qué |
|---|---|
| `justificacion.justificar_clase` | Que el profesor justifique **una clase** con motivo, no el día completo, y la vea reflejada (pendiente A1). |
| `profesor.ver_credenciales_acceso` | Implementada en PROMPT-3/T4: el técnico ve y repone la **clave de inicio de sesión** de profesores (rol maestro); la frontera (nunca `PROFESORES.ID` en la consola del técnico ni credenciales de Supabase) se aplica en `actionReponerClaveAccesoProfesor` y en el panel con `ocultarId`. |

---

## 5. Inventario completo

<!-- INVENTARIO:INICIO -->
Generado por `npm run gen:matriz` — **no editar a mano**. 178 Server Actions.

### `actividades.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionVistaActividades` | exigir: actividad.ver | `actividad.ver` |
| `actionCrearActividad` | exigir: actividad.editar | `actividad.editar` |
| `actionEliminarActividad` | exigir: actividad.editar | `actividad.editar` |
| `actionEntregarActividad` | exigir: actividad.entregar | `actividad.entregar` |
| `actionEntregasDeActividad` | exigir: actividad.editar | `actividad.editar` |
| `actionCalificarEntrega` | exigir: actividad.editar | `actividad.editar` |

### `administracion.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarReportes` | exigir: reporte.ver | `reporte.ver` |
| `actionCrearReporte` | exigir: reporte.crear | `reporte.crear` |
| `actionAnularReporte` | exigir: reporte.anular | `reporte.anular` |
| `actionListarCitas` | exigir: cita.gestionar | `cita.gestionar` |
| `actionListarCitasPropias` | exigir: cita.ver_propias | `cita.ver_propias` |
| `actionSolicitarCita` | exigir: cita.solicitar | `cita.solicitar` |
| `actionCambiarEstadoCita` | exigir: cita.gestionar | `cita.gestionar` |
| `actionListarConstancias` | exigir: constancia.gestionar | `constancia.gestionar` |
| `actionSolicitarConstancia` | exigir: constancia.solicitar | `constancia.solicitar` |
| `actionCambiarEstadoConstancia` | exigir: constancia.gestionar | `constancia.gestionar` |
| `actionListarBuzon` | exigir: buzon.ver | `buzon.ver` |
| `actionEnviarAlBuzon` | exigir: buzon.enviar | `buzon.enviar` |
| `actionMarcarBuzonLeido` | exigir: buzon.ver | `buzon.ver` |
| `actionBuscarAlumnosExpediente` | exigir: alumno.ver_expediente | `alumno.ver_expediente` |
| `actionGuardarNumeroControl` | exigir: alumno.editar_numero_control | `alumno.editar_numero_control` |

### `asignaciones-profesor.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarProfesoresParaAsignacion` | exigir: asignacion.ver | `asignacion.ver` |
| `actionListarGruposMateriasParaAsignacion` | exigir: asignacion.ver | `asignacion.ver` |
| `actionCrearAsignacionProfesor` | exigir: asignacion.editar | `asignacion.editar` |
| `actionDesactivarAsignacionProfesor` | exigir: asignacion.editar | `asignacion.editar` |
| `actionListarAsignacionesProfesorAdmin` | exigir: asignacion.ver | `asignacion.ver` |

### `asistencias.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarGruposAsistencia` | exigir: asistencia.ver_grupo | `asistencia.ver_grupo` |
| `actionDescargarPlantillaAsistencia` | exigir: asistencia.subir | `asistencia.subir` |
| `actionPrevisualizarAsistencias` | exigir: asistencia.subir | `asistencia.subir` |
| `actionConfirmarAsistencias` | exigir: asistencia.subir | `asistencia.subir` |
| `actionObtenerEstadosAsistenciaAlumno` | exigir: asistencia.ver_alumno | `asistencia.ver_alumno` |
| `actionObtenerContextoAlumnoParaTutor` | exigir: asistencia.ver_alumno | `asistencia.ver_alumno` |
| `actionSolicitarJustificacionAsistencia` | exigir: justificacion.solicitar | `justificacion.solicitar` |
| `actionAnularAsistenciaProfesor` | exigir: asistencia.anular | `asistencia.anular` |
| `actionListarAlumnosGruposProfesor` | exigir: asistencia.ver_grupo | `asistencia.ver_grupo` |
| `actionObtenerMateriasHorarioGrupo` | exigir: horario.ver_grupo | `horario.ver_grupo` |
| `actionObtenerCicloActual` | exigir: ciclo.ver_operativo | `ciclo.ver_operativo` |

### `borrar-datos.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionPrevisualizarBorrarPaso` | exigir: ciclo.borrar_datos | `ciclo.borrar_datos` |
| `actionConfirmarBorrarPaso` | exigir: ciclo.borrar_datos | `ciclo.borrar_datos` |

### `calendario.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionObtenerCalendario` | exigir: calendario.ver | `calendario.ver` |
| `actionListarCiclosEscolares` | exigir: ciclo.ver | `ciclo.ver` |
| `actionPrevisualizarCalendarioBase` | exigir: calendario.editar | `calendario.editar` |
| `actionEstablecerCalendarioBase` | exigir: calendario.editar | `calendario.editar` |
| `actionGuardarDiaCalendario` | exigir: calendario.editar | `calendario.editar` |
| `actionEliminarDiaCalendario` | exigir: calendario.editar | `calendario.editar` |
| `actionObtenerCalendarioDePeriodo` | exigir: calendario.ver | `calendario.ver` |
| `actionEstablecerCalendarioBaseDePeriodo` | exigir: calendario.editar | `calendario.editar` |
| `actionGuardarDiaCalendarioDePeriodo` | exigir: calendario.editar | `calendario.editar` |
| `actionEliminarDiaCalendarioDePeriodo` | exigir: calendario.editar | `calendario.editar` |

### `calificaciones.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionSubirCalificacionesMateria` | exigir: calificacion.subir | `calificacion.subir` |
| `actionObtenerUrlCalificacionesMateria` | exigir: calificacion.ver | `calificacion.ver` |
| `actionObtenerMetadatosCalificaciones` | exigir: calificacion.ver | `calificacion.ver` |
| `actionDescargarCalificacionesMateria` | exigir: calificacion.ver | `calificacion.ver` |
| `actionEliminarCalificacionesMateria` | exigir: calificacion.eliminar | `calificacion.eliminar` |

### `carga-academica.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionPrevisualizarCargaAcademica` | exigir: carga_academica.aplicar | `carga_academica.aplicar` |
| `actionAplicarCargaAcademica` | exigir: carga_academica.aplicar | `carga_academica.aplicar` |
| `actionListarCatalogoReconocimiento` | exigir: materia.ver_catalogo | `materia.ver_catalogo` |

### `ciclo-orquestador.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionCrearCicloConContexto` | exigir: ciclo.crear | `ciclo.crear` |

### `contexto-ciclo.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarPeriodosContexto` | exigir: ciclo.ver_contexto | `ciclo.ver_contexto` |
| `actionVerContextoAcademico` | exigir: ciclo.ver_contexto | `ciclo.ver_contexto` |
| `actionClonarContextoAcademico` | exigir: ciclo.clonar_contexto | `ciclo.clonar_contexto` |
| `actionCargarMateriasDesdeCatalogo` | exigir: ciclo.clonar_contexto | `ciclo.clonar_contexto` |
| `actionPrevisualizarRepararTablaLegacy` | exigir: ciclo.reparar_tabla_legacy | `ciclo.reparar_tabla_legacy` |
| `actionRepararTablaLegacy` | exigir: ciclo.reparar_tabla_legacy | `ciclo.reparar_tabla_legacy` |

### `documentos.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionObtenerEstadoDocumentos` | exigir: documento.ver | `documento.ver` |
| `actionCrearCarpeta` | exigir: documento.gestionar_carpetas | `documento.gestionar_carpetas` |
| `actionRenombrarCarpeta` | exigir: documento.gestionar_carpetas | `documento.gestionar_carpetas` |
| `actionEliminarCarpeta` | exigir: documento.gestionar_carpetas | `documento.gestionar_carpetas` |
| `actionSubirDocumento` | exigir: documento.subir | `documento.subir` |
| `actionEliminarDocumento` | exigir: documento.eliminar | `documento.eliminar` |
| `actionDescargarDocumento` | exigir: documento.ver | `documento.ver` |
| `actionAsignarPermiso` | exigir: documento.asignar_permisos | `documento.asignar_permisos` |
| `actionQuitarPermiso` | exigir: documento.asignar_permisos | `documento.asignar_permisos` |
| `actionListarProfesoresPermisos` | exigir: documento.asignar_permisos | `documento.asignar_permisos` |
| `actionTieneAccesoDocumentos` | exigir: documento.ver | `documento.ver` |

### `escolar.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionObtenerPerfilAlumno` | exigir: alumno.ver_perfil | `alumno.ver_perfil` |
| `actionGuardarEtiquetasPersonales` | exigir: alumno.editar_etiquetas | `alumno.editar_etiquetas` |
| `actionActualizarEtiquetasPersonales` | exigir: alumno.editar_etiquetas | `alumno.editar_etiquetas` |
| `actionActualizarEstatusDirectivo` | exigir: alumno.editar_estatus | `alumno.editar_estatus` |
| `actionGuardarComentarioPersonal` | exigir: alumno.editar_datos_personales | `alumno.editar_datos_personales` |
| `actionSubirMateriaExcel` | exigir: calificacion.subir | `calificacion.subir` |
| `actionActualizarMateriaExcel` | exigir: calificacion.subir | `calificacion.subir` |
| `actionSubirRegistroExcel` | exigir: calificacion.subir | `calificacion.subir` |
| `actionObtenerVistaRegistro` | exigir: calificacion.ver | `calificacion.ver` |
| `actionObtenerVistaMateria` | exigir: calificacion.ver | `calificacion.ver` |
| `actionEnviarComentarioAlumno` | exigir: alumno.comentar | `alumno.comentar` |
| `actionBuscarAlumnoPorNombre` | exigir: alumno.ver_perfil | `alumno.ver_perfil` |
| `actionSubirFotoPerfil` | exigir: alumno.editar_datos_personales | `alumno.editar_datos_personales` |
| `actionEtiquetasResumen` | exigir: alumno.ver_perfil | `alumno.ver_perfil` |
| `actionSubirEtiquetasStatus` | exigir: alumno.importar_estatus | `alumno.importar_estatus` |
| `actionSincronizarAlumnosDesdeArchivo` | exigir: alumno.cargar_roster | `alumno.cargar_roster` |
| `actionPrevisualizarSincronizacionAlumnos` | exigir: alumno.cargar_roster | `alumno.cargar_roster` |
| `actionPrevisualizarBajaRoster` | exigir: alumno.borrar_roster | `alumno.borrar_roster` |
| `actionConfirmarBajaRoster` | exigir: alumno.borrar_roster | `alumno.borrar_roster` |
| `actionRestaurarEnRoster` | exigir: alumno.borrar_roster | `alumno.borrar_roster` |

### `etiquetas-dinamicas.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionGuardarEtiquetasDinamicas` | accesoAlumno (delega) | `alumno.editar_etiquetas` |
| `actionEliminarEtiquetaDinamica` | accesoAlumno (delega) | `alumno.editar_etiquetas` |
| `actionReordenarEtiquetasDinamicas` | accesoAlumno (delega) | `alumno.editar_etiquetas` |
| `actionImportarEtiquetasIndividual` | accesoAlumno (delega) | `alumno.editar_etiquetas` |
| `actionImportarEtiquetasGlobal` | exigir: alumno.importar_estatus | `alumno.importar_estatus` |
| `actionGuardarCamposPersonales` | exigir: alumno.editar_datos_personales | `alumno.editar_datos_personales` |

### `evaluaciones.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarCiclosAdmin` | exigir: ciclo.ver_contexto | `ciclo.ver_contexto` |
| `actionDetalleCicloAdmin` | exigir: ciclo.ver_contexto | `ciclo.ver_contexto` |
| `actionListarCiclosConEvaluaciones` | exigir: evaluacion.ver | `evaluacion.ver` |
| `actionCrearCicloEscolar` | exigir: ciclo.crear | `ciclo.crear` |
| `actionGuardarRangoCiclo` | exigir: ciclo.editar | `ciclo.editar` |
| `actionSetActivoCiclo` | exigir: ciclo.activar | `ciclo.activar` |
| `actionGuardarEvaluacion` | exigir: evaluacion.editar | `evaluacion.editar` |
| `actionSetActivoEvaluacion` | exigir: evaluacion.editar | `evaluacion.editar` |
| `actionDiagnosticoEliminarCiclo` | exigir: ciclo.eliminar | `ciclo.eliminar` |
| `actionEliminarCiclo` | exigir: ciclo.eliminar | `ciclo.eliminar` |

### `home.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionAlumnosEstrella` | **SIN SESION** | `portada.ver` |

### `horario.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarPeriodosCatalogo` | exigir: ciclo.ver_contexto | `ciclo.ver_contexto` |
| `actionListarGruposDePeriodo` | exigir: inscripcion.ver | `inscripcion.ver` |
| `actionImportarHorarioPreview` | exigir: horario.importar | `horario.importar` |
| `actionImportarHorarioAplicar` | exigir: horario.importar | `horario.importar` |
| `actionConsultarHorarioGrupo` | exigir: horario.ver_grupo | `horario.ver_grupo` |
| `actionObtenerHorarioAlumno` | exigir: horario.ver_alumno | `horario.ver_alumno` |
| `actionDescargarPlantillaHorario` | exigir: horario.descargar_plantilla | `horario.descargar_plantilla` |

### `inscripciones-admin.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarGruposPeriodo` | exigir: inscripcion.ver | `inscripcion.ver` |
| `actionBuscarAlumnosInscripcion` | exigir: inscripcion.ver | `inscripcion.ver` |
| `actionListarInscripcionesPeriodo` | exigir: inscripcion.ver | `inscripcion.ver` |
| `actionInscribirAlumnoEnCiclo` | exigir: inscripcion.editar | `inscripcion.editar` |

### `justificaciones.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionSolicitarJustificacionConArchivo` | exigir: justificacion.solicitar | `justificacion.solicitar` |
| `actionObtenerMateriasJustificables` | exigir: justificacion.solicitar | `justificacion.solicitar` |
| `actionListarJustificacionesTutor` | exigir: justificacion.ver_propias | `justificacion.ver_propias` |
| `actionListarJustificacionesPendientes` | exigir: justificacion.ver_todas | `justificacion.ver_todas` |
| `actionAprobarJustificacion` | exigir: justificacion.resolver | `justificacion.resolver` |
| `actionRechazarJustificacion` | exigir: justificacion.resolver | `justificacion.resolver` |
| `actionObtenerUrlArchivoJustificacion` | exigir: justificacion.ver_propias | `justificacion.ver_propias` |
| `actionListarMensajesJustificacion` | exigir: justificacion.ver_propias | `justificacion.ver_propias` |
| `actionObtenerJustificacionesDeAlumno` | exigir: justificacion.ver_propias | `justificacion.ver_propias` |
| `actionListarMensajesDelTutor` | exigir: justificacion.ver_propias | `justificacion.ver_propias` |
| `actionListarJustificacionesPendientesConDetalle` | exigir: justificacion.ver_todas | `justificacion.ver_todas` |
| `actionListarHistorialJustificaciones` | exigir: justificacion.ver_todas | `justificacion.ver_todas` |

### `login.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionCerrarSesion` | **SIN SESION** | `SIN ASIGNAR` |

### `materias.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarMateriasConNombreVisible` | exigir: materia.ver_catalogo | `materia.ver_catalogo` |
| `actionGuardarNombreVisibleMateria` | exigir: materia.editar_alias | `materia.editar_alias` |
| `actionQuitarAliasMateria` | exigir: materia.editar_alias | `materia.editar_alias` |
| `actionPrevisualizarAliasArchivo` | exigir: materia.editar_alias | `materia.editar_alias` |
| `actionAplicarAliasArchivo` | exigir: materia.editar_alias | `materia.editar_alias` |
| `actionObtenerMapeoColumnasMateria` | exigir: materia.mapear_columnas | `materia.mapear_columnas` |
| `actionGuardarMapeoColumnasMateria` | exigir: materia.mapear_columnas | `materia.mapear_columnas` |
| `actionDescargarPlantillaMateria` | exigir: materia.descargar_plantilla | `materia.descargar_plantilla` |
| `actionListarMateriasConfiguracion` | exigir: materia.ver_catalogo | `materia.ver_catalogo` |
| `actionCambiarVisibilidadMateria` | exigir: materia.activar_desactivar | `materia.activar_desactivar` |

### `mensajes-internos.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionDestinatariosInternos` | exigir: mensaje_interno.usar | `mensaje_interno.usar` |
| `actionBandejaInterna` | exigir: mensaje_interno.usar | `mensaje_interno.usar` |
| `actionHiloInterno` | exigir: mensaje_interno.usar | `mensaje_interno.usar` |
| `actionEnviarMensajeInterno` | exigir: mensaje_interno.usar | `mensaje_interno.usar` |

### `noticias.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionObtenerNoticiasInicio` | **SIN SESION** | `portada.ver` |
| `actionPublicarNoticiaInicio` | exigir: noticia.publicar | `noticia.publicar` |

### `portada.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarMediosPortada` | exigir: noticia.publicar | `noticia.publicar` |
| `actionFirmarSubidaPortada` | exigir: noticia.publicar | `noticia.publicar` |
| `actionRegistrarMedioPortada` | exigir: noticia.publicar | `noticia.publicar` |
| `actionEliminarMedioPortada` | exigir: noticia.publicar | `noticia.publicar` |
| `actionReordenarPortada` | exigir: noticia.publicar | `noticia.publicar` |
| `actionGuardarAjustesPortada` | exigir: noticia.publicar | `noticia.publicar` |

### `profesores.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionCambiarClaveProfesor` | exigir: profesor.cambiar_clave_propia | `profesor.cambiar_clave_propia` |
| `actionReponerClaveAccesoProfesor` | exigir: profesor.ver_credenciales_acceso | `profesor.ver_credenciales_acceso` |
| `actionListarProfesoresCredenciales` | exigir: profesor.ver_credenciales_acceso | `profesor.ver_credenciales_acceso` |
| `actionCambiarDebeCambiarCredencialesProfesor` | exigir: profesor.forzar_cambio_clave | `profesor.forzar_cambio_clave` |

### `semestres.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarSemestresOferta` | exigir: semestre.ver | `semestre.ver` |
| `actionActivarSemestre` | exigir: semestre.activar | `semestre.activar` |
| `actionDesactivarSemestre` | exigir: semestre.activar | `semestre.activar` |

### `tablas.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarRegistrosSupabase` | exigir: calificacion.ver | `calificacion.ver` |

### `tutores.ts`

| Action | Guardia hoy | Capacidad |
|---|---|---|
| `actionListarTutores` | exigir: tutor.ver_lista | `tutor.ver_lista` |
| `actionListarTutoresConCredenciales` | exigir: tutor.ver_lista | `tutor.ver_lista` |
| `actionBuscarAlumnoParaTutor` | exigir: tutor.crear | `tutor.crear` |
| `actionPrevisualizarConsolidacionTutores` | exigir: tutor.crear | `tutor.crear` |
| `actionCrearTutor` | exigir: tutor.crear | `tutor.crear` |
| `actionObtenerTutorDetalle` | exigir: tutor.ver_propio | `tutor.ver_propio` |
| `actionObtenerDatosTutor` | exigir: tutor.ver_propio | `tutor.ver_propio` |
| `actionCambiarCredencialesTutor` | exigir: tutor.cambiar_credenciales_propias | `tutor.cambiar_credenciales_propias` |
| `actionListarCurpsDeTutor` | exigir: tutor.ver_propio | `tutor.ver_propio` |
| `actionListarAlumnosDelTutor` | exigir: tutor.ver_propio | `tutor.ver_propio` |
| `actionPrevisualizarGeneracionTutores` | exigir: tutor.generar_automaticos | `tutor.generar_automaticos` |
| `actionGenerarTutoresAutomaticos` | exigir: tutor.generar_automaticos | `tutor.generar_automaticos` |

<!-- INVENTARIO:FIN -->

---

## 6. Hallazgos de la auditoría

### 6.0 La única action con `SIN ASIGNAR` a propósito (2026-09-16)

`actionCerrarSesion` aparece en la §5 como **SIN SESION · SIN ASIGNAR** y no es
un descuido: **no hay capacidad que asignarle.**

`exigir()` responde «¿puede este rol ejecutar tal capacidad?». Cerrar la propia
sesión no es una capacidad que un rol tenga o deje de tener: la action no lee
ni escribe datos de nadie, solo retira la credencial de quien la envía. Pedir
permiso ahí tendría además un efecto perverso — una sesión rota o con un rol
que ya no existe no podría salir de sí misma, que es justo cuando más falta
hace poder salir.

Está declarada como excepción en `scripts/test-auditoria-permisos.mjs`
(`OPERAN_SOBRE_LA_PROPIA_CREDENCIAL`), junto a las dos públicas de
`portada.ver` y la delegación verificada de etiquetas.

> **Por qué se anota aquí.** Al crearla se declaró la excepción en el detector
> pero NO en este inventario, y `gen:matriz --check` —que es otro auditor, con
> otra lista— salió con código 1 y habría dejado el CI de `main` en rojo. Dos
> auditores sobre la misma regla necesitan enterarse los dos.

### 6.1 Dieciséis actions no leían la sesión (resuelto en PROMPT-2)

De las 141 (2026-09-06), 16 no llamaban a `obtenerSesionPortal()` **ni delegaban** en
algo que lo hiciera. El PROMPT-2 las migró a `exigir()` (o las declaró públicas).

| Action | Situación | Resolución PROMPT-2 |
|---|---|---|
| `actionAlumnosEstrella` · `actionObtenerNoticiasInicio` | **Correcto.** Portada pública, antes del login. Capacidad `portada.ver`. | Públicas por diseño (excepción declarada del detector). |
| `actionListarMateriasSupabase` · `actionListarRegistrosSupabase` | Sin consumidor (la primera); expone nombres de tablas. | `actionListarMateriasSupabase` **borrada**; `actionListarRegistrosSupabase` **cableada** con `calificacion.ver`. |
| `actionBuscarAlumnoPorNombre` · `actionEtiquetasResumen` · `actionObtenerMapeoColumnasMateria` | Sin consumidor o de solo lectura. | Cableadas con su capacidad (`alumno.ver_perfil`, `materia.mapear_columnas`). |
| `actionActualizarEtiquetasPersonales` · `actionActualizarEstatusDirectivo` | Delegan en función guardada; la guardia quedaba invisible. | `exigir()` al principio las hace explícitas. |
| ~~`actionListarMensajesChat` · `actionEnviarMensajeChat`~~ | ⚠ Agujero real del chat. | El chat se retiró del sistema antes del PROMPT-2 (código en `_borrador/`). |
| **Las 5 de `calificaciones.ts`** | ⚠ Leían `rol` del FormData. | **T4 resuelto:** cableadas con `exigir("calificacion.subir/ver/eliminar")`; el rol sale solo de la cookie firmada. |

### 6.2 Lo que esta auditoría demuestra

Para saber si cada action estaba protegida hubo que **rastrear cadenas de delegación
a mano**. Con `exigir()` como primera línea de toda action, esa pregunta se responde
con un `grep` — y el detector `scripts/test-auditoria-permisos.mjs` (paso 5 del plan)
la responde automáticamente en cada cambio.

### 6.3 Resolución T2 — las 13 capacidades con guardias mezcladas (PROMPT-2)

Resuelto el 2026-09-06 y aplicado en `lib/auth/permisos.ts`. Detalle completo en
`docs/historial/informes/INFORME-PROMPT-2-CENTRALIZAR-PERMISOS.md`.

| Capacidad (las 13) | Decisión | Salida |
|---|---|---|
| `alumno.ver_perfil` | UNIÓN → sesión + `accesoAlumno` (corrige 2 SIN SESION) | D·M·T·A |
| `alumno.editar_etiquetas` | UNIÓN → `accesoAlumno` | D·T |
| `asistencia.ver_alumno` | UNIÓN + alcance por rol en la action | D·M·T·A |
| `calificacion.ver` | CORRECCIÓN (vista completa = D; alumno solo su fila) | D·M·A |
| `calificacion.subir` | UNIÓN | D·M |
| `ciclo.ver` | DIVISIÓN → `ciclo.ver` (listar, cualquier sesión) | D·M·T·A |
| `documento.ver` | UNIÓN + `nivelAccesoProfesor` ortogonal | D·M |
| `horario.importar` | DIVISIÓN → `horario.descargar_plantilla` (descargar plantilla, D·M) | D |
| `justificacion.solicitar` | UNIÓN + alcance por CURP en la action | D·M·T·A |
| `justificacion.ver_propias` | UNIÓN + alcance por CURP | D·M·T·A |
| `materia.ver_catalogo` | UNIÓN | D·M |
| `materia.mapear_columnas` | CORRECCIÓN (lectura previa al guardado) | D·M |
| `tutor.ver_propio` | UNIÓN (directivo administra; tutor su propia matrícula) | D·T |

Capacidades NUEVAS creadas por las divisiones de T2 (entran a `lib/auth/capacidades.ts`
y a la §5 al regenerar): `ciclo.ver_contexto` (D), `ciclo.ver_operativo` (D·M) y
`horario.descargar_plantilla` (D·M).

Decisiones anexas del PROMPT-2 (mismo informe):
- `actionListarMateriasSupabase` se **borró** (sin consumidor); `actionListarRegistrosSupabase` se **cableó** con `calificacion.ver`.
- Las 5 de `calificaciones.ts` se **cablearon** con `exigir()` leyendo el rol SOLO de la cookie (T4).

---

## 7. Cómo se usa este documento

**Para rellenarlo:** en la tabla de §4, sustituye cada `?` por `✅` o déjalo vacío.
Borra los `✅` de la columna **D** donde quieras que directivo pierda la capacidad.
Las filas sin `?` ya están decididas por el código actual y no necesitan cambio.

**Durante la migración:** cada commit de dominio compara contra §5. Si una action
cambia de alcance, o se documenta aquí o el commit está mal.

**Este documento es permanente.** No se archiva al terminar la migración: es la
referencia que se consulta para saber quién puede qué, y el sitio donde se edita
cuando cambia. Dos mitades con dueños distintos:

| Sección | Quién la mantiene |
|---|---|
| §4 — la matriz | **A mano.** Es la decisión, y es lo que se edita al añadir o quitar un rol. |
| §5 — el inventario | **Generada.** `npm run gen:matriz` la reescribe desde `app/actions/**`. Nunca se edita a mano. |

Regenerar §5 tras cualquier cambio en las actions. El generador respeta las
capacidades ya asignadas, marca `SIN ASIGNAR` las actions nuevas y avisa de las que
desaparecieron. Así el inventario no puede quedarse desfasado en silencio.

## 8. Reglas que quedan fijadas

1. Ninguna `action*` accede a datos sin haber llamado antes a `exigir()`.
2. El rol **nunca** se lee de `FormData`, parámetros ni del cliente. Solo de la cookie firmada.
3. Un rol nuevo es una fila en la matriz. Si obliga a tocar archivos de `app/actions/`, la centralización está incompleta.
4. La UI usa la **misma** función `puede()` que el servidor. Un botón visible que el servidor rechaza es un bug de la matriz, no de la UI.
5. `accesoAlumno` y `nivelAccesoProfesor` son ortogonales a las capacidades: la capacidad dice *qué* puede hacer; ellos dicen *sobre quién*. No se fusionan.

---

## 9. Añadir o quitar un rol

El caso para el que existe este documento. Cuatro pasos, ninguno toca `app/actions/`:

**Añadir**
1. Columna nueva en la matriz de §4 y decidir cada fila (`✅` o `X`, sin vacíos).
2. Añadir el rol a `PortalRole` en `lib/auth/types.ts`.
3. Añadir su fila a la matriz de `lib/auth/permisos.ts` y su caso a `rolDesdePermisos()`.
4. Correr `test-permisos.mjs`. La suite compara la matriz del código contra este documento.

**Quitar**
1. Marcar la columna entera y decidir, capacidad por capacidad, **a qué rol pasa cada una**. Una capacidad que se queda sin ningún rol queda inaccesible: si es deliberado, escribirlo aquí.
2. Quitar el rol de `PortalRole` y de la matriz. TypeScript señalará cada sitio que aún lo nombra.
3. Migrar las sesiones vivas de ese rol (la cookie dura 7 días: alguien seguirá teniéndolo).
4. Correr la suite.

**Comprobación de dependencias.** Antes de dar por buena una columna, verificar que
cada capacidad de escritura tenga su lectura. Conceder `materia.editar_alias` sin
`materia.ver_catalogo` deja una pantalla vacía, no un error: la UI lista antes de
editar. Las parejas a revisar siempre:

| Si concedes | Concede también |
|---|---|
| `*.editar`, `*.crear`, `*.eliminar` de un dominio | el `*.ver` de ese dominio |
| `calendario.editar` · `evaluacion.*` · `inscripcion.*` · `horario.importar` | `ciclo.ver` (todas empiezan eligiendo ciclo) |
| `tutor.crear` · `tutor.generar_automaticos` | `tutor.ver_lista` |
| `justificacion.resolver` | `justificacion.ver_todas` o `ver_propias` |
