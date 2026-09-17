# INFORME — PROMPT E · Capas y tamaño: sacar el I/O de `app/actions/` y partir los gigantes

> Ejecutado el 2026-09-16 sobre `feature/capas-y-tamano`, siguiendo
> `docs/historial/prompts/PROMPT_CLINE_E_EJECUTAR_CAPAS.md` (que ejecuta
> `docs/normativo/PROMPT_E_CAPAS_Y_TAMANO.md`). Refactor PURO: cero cambios de
> comportamiento, ningún fallback retirado, ninguna migración.

---

## Implementado

### Parte 1 · nueve actions pequeñas (C8 13 → 4)

| Action | Qué bajó a `lib/` | A dónde |
|---|---|---|
| `etiquetas-dinamicas.ts` | validación por lotes de CURP existentes | `alumno/alumnos.ts::listarCurpsExistentes` |
| `evaluaciones.ts` | leer el nombre del ciclo y confirmar el borrado | `ciclo/eliminar-ciclo.ts::eliminarCicloConConfirmacion` |
| `horario.ts` | listar periodos del catálogo | `ciclo/ciclo-estado.ts::listarPeriodosSimple` |
| `contexto-ciclo.ts` | listar periodos + validar los dos periodos de la reparación | `ciclo/ciclo-estado.ts` · `ciclo/contexto-ciclo.ts::validarPeriodosReparacion` |
| `noticias.ts` | buffer + subida + invalidación de caché | `cloudinary/noticias.ts::publicarNoticiaInicio` |
| `carga-academica.ts` | catálogo real de reconocimiento | `catalogo/carga-academica.ts::listarCatalogoReconocimiento` |
| `asignaciones-profesor.ts` | oferta de `grupo_materias` para el selector | `catalogo/asignaciones-profesor.ts::listarGruposMateriasParaAsignacion` |
| `profesores.ts` | 4 consultas (ID por CLAVE, reponer clave, flag, permisos) y la frontera del técnico | `catalogo/profesores.ts` (5 funciones) |
| `escolar.ts` | motivo de materia no cargable · buffer+subida de la foto de perfil | `catalogo/catalogo-academico.ts::motivoMateriaNoCargable` · `alumno/foto-perfil.ts::subirFotoPerfilAlumno` |

Cierre: **C8 = 4** (umbral bajado a 4). `app/actions/escolar.ts` bajó de 1 038 a
menos de 1 000 líneas sin partirse, así que C9 bajó a 6.

### Parte 2 · documentos y materias (C8 4 → 2)

- `documentos.ts` → `lib/escolar/documentos.ts`: `obtenerDocumento`,
  `subirDocumento` (buffer + `storage.upload` + `documentos`, con limpieza del
  archivo si falla el registro), `eliminarDocumento`, `urlFirmadaDocumento`.
- `materias.ts` → `lib/escolar/catalogo/catalogo-academico.ts`:
  `filtrarTablasVisibles`, `listarTablasLegacyOcultas`,
  `cambiarVisibilidadMateria`. La action usa el del dominio en lugar de un
  envoltorio local.

Cierre: **C8 = 2** (umbral bajado a 2).

### Parte 3 · justificaciones y asistencias (C8 2 → 0)

- `app/actions/justificaciones.ts` → `lib/escolar/asistencia/justificaciones.ts`:
  `justificacionesTienenColumnaMateria`, `asegurarBucketJustificaciones`,
  `subirArchivoJustificacion`, `eliminarArchivoJustificacion`,
  `urlFirmadaJustificacion`, `obtenerJustificacion`, `estadoJustificacionPrevia`,
  `bloquesPorMateriaDiaDe`, `guardarJustificacionConArchivo`,
  `marcarEstadoJustificacion`, `listarJustificacionesDeCurps/DeCurp/Pendientes`,
  `listarJustificacionesConDetalle` y `listarMensajesDeTutorConDetalle`.
  Los tipos `JustificacionConDetalle` y `MensajeJustificacionConDetalle` se
  re-exportan desde la action (la UI los importa de ahí).
- `app/actions/asistencias.ts` → cinco destinos: `alumno/alumnos.ts`
  (`listarNombresCompletosPorCurp`, `obtenerNombreCompletoAlumno`),
  `asistencia/asistencias.ts` (`resolverIdentidadAlumnoInscripcion`,
  `esquemaAtribucionDisponible`, `listarAportesDeProfesorEnDia`,
  `fijarClasesAsistidas`), `horario/horario-semanal.ts`
  (`listarGrupoIdsConHorario`), `catalogo/asignaciones-profesor.ts`
  (`listarGrupoIdsAsignadosProfesor`) y
  `asistencia/justificaciones.ts` (`guardarJustificacionDiaCompleto`).

Cierre: **C8 = 0 → regla DURA**. `app/actions/asistencias.ts` bajó de 1 158 a
menos de 1 000 líneas.

### Parte 4 · partir los seis gigantes (C9 6 → 0)

| Gigante (antes) | Módulos (después) |
|---|---|
| `asistencia/asistencias.ts` 1 846 | `asistencia-comun` · `asistencia-configuracion` · `asistencia-plantillas` · `asistencia-estados` + fachada |
| `horario/horario-importar.ts` 1 267 | `horario-importar-lectura` · `horario-importar-validacion` · `horario-importar-aplicar` + fachada (tipos) |
| `catalogo/catalogo-academico.ts` 1 187 | `catalogo-academico-resolucion` + fachada (administración: acceso, asignaciones, visibilidad) |
| `ciclo/contexto-ciclo.ts` 1 155 | `contexto-ciclo-clonar` · `contexto-ciclo-catalogo` · `contexto-ciclo-reparar` + fachada |
| `tutores/tutores.ts` 1 065 | `tutores-credenciales` · `tutores-relacion` · `tutores-generacion` + fachada |
| `app/actions/asistencias.ts` 1 028 | sus ayudantes de ciclo a `ciclo/evaluaciones.ts::resolverOperativoConParciales` y `resolverOperativoYValidarParcial`; la action queda con `exigir()` + delegación |

**Los 14 módulos nuevos se re-exportan desde su archivo original** (`export *`
desde la fachada o re-export nominal), así que **ningún import existente cambió
de ruta**. El código movido se extrajo por rangos: no se reescribió a mano
línea a línea.

Cierre: **C9 = 0 → regla DURA**.

---

## Archivos principales

- **Modificados:** las 13 actions con `.from()`, los 15 módulos de `lib/` que
  recibieron el I/O, `scripts/test-orden.mjs` (los dos umbrales, que ahora son
  0), `scripts/test-auditoria-ciclo-f1.mjs` y `scripts/test-traspaso-materia.mjs`
  (registros de rutas — ver «Pendiente»), y `ESTADO-ACTUAL.md` §7.
- **Nuevos:** los 14 módulos de la tabla de la parte 4.

---

## Arquitectura

- **Cada consulta fue a la familia que ya poseía el dominio**, no a un módulo
  nuevo inventado: ciclo (`listarPeriodosSimple`, `eliminarCicloConConfirmacion`),
  catálogo (reconocimiento, oferta de `grupo_materias`, visibilidad de materias),
  asistencia (identidad desde la inscripción, aportes del profesor, adjuntos y
  mensajes), horario (`listarGrupoIdsConHorario`) y tutores. No se creó ningún
  `<dominio>-datos.ts` junto a `<dominio>.ts` (R6).
- **La action quedó con `exigir()` → validar entrada → delegar → devolver.** El
  ALCANCE y la capacidad siguen decidiéndose en la action (`sesionAutorizaCurp`,
  `resolverAccesoAlumno`, `profesorImparteEnGrupo`); lo que bajó es el I/O, y el
  cliente (`supabase`) se sigue creando en la action y se pasa como parámetro,
  que es la convención de `lib/escolar/`.
- **Corte por responsabilidad, no por número de líneas.** En `asistencia` el
  vocabulario y los helpers puros quedaron en un módulo propio
  (`asistencia-comun`) precisamente para que las tres partes siguientes no
  dependieran de la fachada: el grafo de imports queda en una sola dirección,
  sin ciclos de valores.
- **Dos funciones crecieron a propósito para no duplicar**:
  `estadoJustificacionPrevia` (sirve al flujo con y sin `materia_clave`) y el
  `consultarPeriodo` del ciclo, reutilizado para el nombre del ciclo en lugar de
  escribir otra consulta.
- **Se conservaron dos lecturas que se solapan a propósito**:
  `motivoMateriaNoCargable` (un id, responde «por qué no») y
  `filtrarTablasVisibles` (una lista, en una sola consulta). Unificarlas habría
  cambiado el número de consultas, que es justo lo que un refactor puro no puede
  hacer. Quedan colindantes en el mismo módulo, que es la mejora real.

---

## Seguridad

- **Los `exigir()` no se movieron**: siguen al principio de cada action, con la
  misma capacidad y en el mismo orden respecto a la validación de entrada.
- `test:permisos`: **475 + 229 pasadas, 0 fallidas** (idéntico al punto de partida).
- `gen:matriz-permisos --check`: **exit 0** («Al día»).
- Las decisiones de autorización siguen fuera de `lib/escolar/`: bajó la
  lectura/escritura de datos, no la decisión de quién puede hacerla.
- Ningún `exigir()` nuevo, ninguna capacidad nueva, ningún rol nuevo.

---

## Validación

`node scripts/test-orden.mjs` — antes / después:

| Regla | Antes | Después |
|---|---|---|
| C1 alias `@/` en `lib/escolar` | 0 | 0 |
| C2 `lib/` → `app/` | 0 | 0 |
| C3 «use client» con `lib/supabase`/`server-only` | 0 | 0 |
| C4 action → action | 0 | 0 |
| C5 `-puro` con I/O | 0 | 0 |
| C6 `test-`/`diag-`/`probe-` que escriben | 0 | 0 |
| C7 raíz cerrada | 0 | 0 |
| **C8 actions con `.from()`** | **13/13 (trinquete)** | **0 (DURA)** |
| **C9 archivos >1 000 líneas** | **7/7 (trinquete)** | **0 (DURA)** |
| C10 scripts sin fila en README | 35/35 | 35/35 |

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | 0 errores |
| `npm run test:ci` | **37/37 suites en verde** + `ESTADO-ACTUAL.md` al día |
| `npm run test:permisos` | 475 + 229, 0 fallidas |
| `node scripts/gen-matriz-permisos.mjs --check` | exit 0 |
| `npm run lint` | **17 errores / 40 warnings** (el techo del prompt, sin subir) |
| `npm run build` | 9 rutas |
| `npm run panel` | estado escrito · 5 alertas, todas preexistentes (frescura y peso de `ESTADO-ACTUAL.md` + tres pendientes humanos) |

---

## Legacy

Nada se retiró (R8). Siguen en pie, y ahora con su sitio documentado:

- `FALLBACK_TODAS_LAS_MATERIAS`, `FALLBACK_LEGACY_ETIQUETAS_ACTIVO` y
  `FALLBACK_LEGACY_CONFIG_CLASES_ACTIVO`: se movieron junto con su módulo,
  conservando valor y condiciones.
- `configuracion_clases_profesor` y las rutas de lectura legacy siguen enteras:
  solo cambiaron de archivo.
- `resolverAsignacionesProfesor` (por CLAVE, `@deprecated`) mantiene contrato y
  aviso; `profesor_clave` sigue siendo columna legacy.
- Ninguna tabla, columna ni dato se tocó. **Cero SQL, cero migraciones.**

---

## Pendiente

1. **Dos suites de auditoría leen archivos por ruta** y hubo que actualizar sus
   registros (es información, no un fallo):
   - `scripts/test-auditoria-ciclo-f1.mjs`: el lector del ciclo global de
     `lib/escolar/asistencia/asistencias.ts` vive ahora en
     `asistencia-configuracion.ts` (mismo helper, misma regla); además la lista
     de lectores pasa de 6 a 5 porque `actionListarCatalogoReconocimiento` dejó
     de ser lector al delegar (el lector no desapareció: bajó de capa). Quedó
     documentado dentro del propio script, como el precedente de Océano.
   - `scripts/test-traspaso-materia.mjs`: `confirmarAsistencias` está ahora en
     `asistencia-plantillas.ts`; la aserción (la RPC antes de los UPSERT) es la
     misma.
   - El invariante que ambas vigilan no se relajó: se conserva palabra por palabra.
2. **`docs/sistema/MAPA-DEL-SISTEMA.md` §2** debería registrar que la deuda de
   capas y tamaño cerró. `ESTADO-ACTUAL.md` §7 ya lo dice.
3. **Duplicación conceptual deliberada** (candidata a un prompt futuro, nunca a
   este): `motivoMateriaNoCargable` y `filtrarTablasVisibles` expresan la misma
   regla con dos formas de consulta distintas.
4. Nada quedó a medias por imposibilidad técnica: los trece archivos de
   `app/actions/` y los seis gigantes se cerraron por completo.


