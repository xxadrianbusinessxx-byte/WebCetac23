# INFORME — Rol Administración escolar y tablas de sistema clasificadas

**Fecha:** 2026-09-24 · **Rama:** `feature/rol-administracion-escolar` (sale de
`feature/portada-administrable`) · **Ejecutado por:** Claude, directamente desde el pedido

## 1 · Las diez tablas que salían como materias (commit `32664a5`)

Cerrado el pendiente `tablas-sistema-como-materia`. El descubrimiento de materias es
NEGATIVO: toda tabla que no esté en la lista de sistema se ofrece como materia.

- **Una sola lista:** `lib/escolar/materia/tablas-sistema.ts`, que usan la app y
  `gen-tablas-desde-supabase.mjs`. Antes cada uno tenía su copia y ya no coincidían.
- Los nombres pasan al registro `tables.ts`; los cuatro módulos que los declaraban por su
  cuenta los importan de ahí.
- **C15** en `test-orden`: falla si una tabla creada en `supabase/*.sql` o declarada en
  `tables.ts` no está clasificada. Probado quitando `reportes_alumno`: la detecta por las
  dos vías.
- De paso, el generador escribía en `lib/escolar/` en vez de `lib/escolar/materia/`.

**Medido contra la base:** 426 tablas, 360 materias, todas con forma `1ROAMAT001`,
**0 colándose**.

## 2 · El rol

`administracion` («Administración escolar»): una fila normal de `PROFESORES` con
`Permisos = 'Administracion'`, con la misma forma que el técnico (PROMPT-3). Sin segundo
camino de acceso. Entra directo a `/oceano`.

| Pestaña | Apartados | Pieza |
|---|---|---|
| **Alumnos** | Datos personales · Estatus académico · Boleta · Asistencia · Calendario de asistencia · Horario · Seguimiento semestral · Seguimiento médico · Notificaciones | las MISMAS del alumno y el tutor |
| **Tutores** | Tutores | `TutoresPanel` (el del técnico) |
| **Trámites escolares** | Constancias de estudios (Vista previa **beta** · Solicitudes) · Reportes | vista previa nueva · paneles del directivo |
| **Documentos** | Documentos | `DocumentosPanel` |
| **Mensajes** | Bandeja | la misma pestaña del personal |

**El expediente no tiene pantallas propias.** Un buscador en el sidebar
(`buscador-expediente-oceano.tsx`, en el sitio del selector del tutor) fija al alumno en
la URL. El servidor carga su perfil con la action de siempre, y cada apartado monta la
pieza que ya ven el alumno y su tutor (`contenido-administracion.ts`). Datos personales,
etiquetas y foto se editan: `resolverAccesoAlumno` le da a este rol cualquier alumno, sin
importación masiva.

**Reportes** se elaboran sobre el alumno elegido (el panel del directivo recibe
`alumno` y no pide la CURP). La lista muestra los de ese alumno, con un conmutador para
ver todos.

**Constancias (beta).** `constancia-puro.ts` arma el texto con el expediente: nombre,
CURP, matrícula, grado, grupo, carrera y ciclo. Lo que el sistema no guarda (folio, CCT,
quién expide, firma, sello) aparece como **hueco marcado**, no se inventa. Sin
inscripción no arma el texto y dice qué falta. Las solicitudes de constancia usan el flujo
existente.

## 3 · Permisos

25 capacidades. Una nueva, **`alumno.ver_expediente`**: buscar entre TODOS los alumnos.
Solo la tiene este rol. `alumno.ver_perfil` no basta, porque la tienen también maestro,
tutor y alumno, con alcance acotado.

**Puede:** leer todo lo del alumno y editar sus datos, etiquetas y estatus; gestionar
tutores; reportes (ver, crear, anular); gestionar constancias; las cinco de documentos;
mensajes; cambiar su clave.
**No puede:** calificar, pasar lista, configurar ciclo o catálogo, resolver ni solicitar
justificaciones, pedir citas, importar en masa ni ver credenciales de profesores.

Documentos lleva las cinco capacidades, como directivo y técnico. Con solo ver y subir no
vería nada hasta que alguien le asignara carpeta por carpeta.

**Alcance en el servidor**, en los cinco sitios que negaban a quien no fuera directivo o
maestro: `resolverAccesoAlumno`, asistencia, horario, justificaciones (solo lectura) y la
vista de calificaciones. Esta última le da **la fila del alumno**, como al tutor, no la
tabla del grupo.

**Una decisión:** «Sesiones programadas» NO entra en el expediente. Su pieza lista las
citas de la CURP de la *sesión* y ofrece «Solicitar cita», que este rol no tiene.
Enseñarla sería una lista siempre vacía con un botón que el servidor rechaza.

**Los roles viven en una lista**, `ROLES_PORTAL` (`lib/auth/types.ts`). La sesión y
`rolesDe` la recorren; antes cada sitio los repetía.

## 4 · La cuenta — NO creada

`scripts/migrar-crear-administracion.mjs` (dry-run por defecto; `--apply` escribe). La
clave inicial no está en el repo: se pasa con `--clave=…` o se genera al azar y se imprime
una vez. El dry-run contra la base confirma que no existe y que el plan es el esperado.
**No se ejecutó con `--apply`: crear credenciales de acceso queda en manos del
responsable.**

Nota: el técnico solo repone claves de cuentas de rol maestro (frontera del PROMPT-3), así
que la clave de esta cuenta no se puede reponer desde la UI. Se repone con el mismo script
o a mano.

## 5 · Pruebas

| Qué | Resultado |
|---|---|
| `test-permisos` (6 roles; código ⇄ §4 con la columna AE) | **674/0** (antes 573) |
| `test-rediseno-oceano` (mapa del rol; cada apartado del expediente es una pieza REAL del alumno) | **431/431** (antes 348) |
| `test-uis-pendientes` (+ constancia: texto, fecha en español, pendientes nunca inventados) | **73/73** (antes 62) |
| `test-auditoria-permisos` | 177 actions, 0 fallidas |
| Servidor con la base real, sin sesión web (`resolverAccesoAlumno`, `rolDesdePermisos`, búsqueda) | 14/14 |
| HTTP sin sesión: `actionBuscarAlumnosExpediente` | 200 `{ ok: false, "No autorizado." }` |
| Interfaz (página temporal con datos de ejemplo, **borrada**) | 5 pestañas; buscador; expediente con «Editar»; constancia beta; reporte sobre el alumno; tutores, documentos y mensajes montan; sin errores |

**No probado:** una sesión real del rol. Hace falta la cuenta, y para entrar hace falta su
clave.

`tsc` 0 · `eslint` 0 · `test-orden` 15 reglas · `test:ci` 41/41 · `gen:matriz --check` ·
`verificar-docs` (arranque 10 105 / 10 500) · `build`.
