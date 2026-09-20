# ESTADO ACTUAL — qué es verdad hoy

Este archivo sustituye a `contexto.feliz` como lectura de arranque. El detalle
histórico —`contexto.feliz.md`, y todo `docs/historial/`— **no describe el presente**.

Regla de mantenimiento: **este archivo se actualiza en el mismo cambio que lo vuelve
falso.** Si crece más de ~150 líneas, lo que sobra es historial y va a `docs/historial/`.

- **Última revisión:** 2026-09-17 (UIs pendientes: 56 apartados activos, 0 maquetas)
- **HEAD:** `ec2579d` (2026-09-17) · árbol limpio

---

## 1. Qué es el proyecto

Portal escolar del CETAC 23. Roles: **alumno**, **profesor** (rol `maestro`),
**directivo**, **tutor** y, desde el PROMPT-3, **técnico**.
Next.js 16.2.6 · React 19.2.4 · Supabase (PostgREST + Storage) · Cloudinary · SheetJS.

**No hay REST API propia.** No existe `app/api/`. Todo el transporte navegador→servidor
son Server Actions. Detalle completo en `docs/sistema/FLUJO-TECNICO.md`.

## 2. La raíz del sistema

Un ciclo escolar es una fila de **`periodos`** con un `uuid`. Todo lo académico cuelga
de `periodos.id`. La exclusividad de un solo ciclo operativo la impone PL/pgSQL
(`activar_ciclo_operativo`), no una convención de código.

Existe **un solo periodo**: `2026-2027` = `7cf5cca7` (`activo=true`,
`estado=operativo`). Los ciclos duplicados del P0 y `BORRADOR` se eliminaron con la
RPC `eliminar_ciclo` (relato y cifras → `docs/historial/BITACORA-2026-09.md`).

Fuentes únicas que **no** se duplican (regla R6):

| Concepto | Fuente única |
|---|---|
| Ciclo escolar | `periodos.id` |
| Alumno → grupo | `inscripciones_alumno` |
| Identidad de profesor | `PROFESORES.ID` |
| Identidad de materia | `idInterno` = nombre de la tabla física |
| Parciales | `periodos_evaluacion` |

## 3. Deudas estructurales vivas

Son **tres**, y casi todo bug «nuevo» resulta ser una de ellas:

1. **Calendario con dos identidades** — `periodo_id` (correcta) conviviendo con la
   columna texto `ciclo_escolar`, conservada como legado (R8).
2. **Identidad del profesor** — varios comparten la CLAVE `4321`; `profesor_clave`
   queda como columna legacy.
3. **Una tabla física por materia** — nombres en texto, columnas creadas por RPC.

Manifestación, ubicación y cifras: `docs/sistema/MAPA-DEL-SISTEMA.md` §2a — que es
donde se mantienen, no aquí. Ninguna se cierra «de paso»: cada una necesita su
propia migración verificada (R8).

## 4. Seguridad — cómo está realmente

- Sesión: cookie httpOnly firmada con HMAC-SHA256, 7 días (`lib/auth/session.ts`).
- Tutores: scrypt + `timingSafeEqual`. Contraseña inicial derivada del CURP del hijo.
- **RLS no autoriza nada.** Las policies son `*_all USING (true)`. La autorización real
  vive en TypeScript. Desde el PROMPT-2, la decisión «qué puede un rol» está
  centralizada en `lib/auth/permisos.ts` (`exigir()` al inicio de cada Server Action);
  las decisiones de alcance «sobre quién» se conservan ortogonales
  (`resolverAccesoAlumno`, `nivelAccesoProfesor`). Es una decisión consciente, pero
  significa que **un bug de autorización en TS es un bug de seguridad sin red debajo**.
- **`directivo` es un supervisor global**: tiene `asistencia.subir`, `ciclo.ver` y
  `justificacion.solicitar` para operar sin depender de asignaciones (R-4). Consecuencia
  intencionada: puede **solicitar y aprobar** la misma justificación.
- Todo `scripts/` corre con `service_role` y salta RLS. No hay entorno de staging.

## 5. Estado de datos — última medición conocida

> Cifras del **2026-09-06**. Antes de apoyarse en cualquiera, volver a correr el script
> que las produjo: son una foto, no un invariante.

- **Un solo periodo**: `2026-2027` (`7cf5cca7`), operativo.
- Grupos / materias activas / inscripciones activas / bloques de horario:
  **24 / 241 / 357 / 168**. **0 CURPs con más de una inscripción activa.**
- Calendario del operativo: **77 filas** por `periodo_id` (73 clase, 3 descanso, 1 festivo).
- `asistencia_alumnos`: **3 863 filas**, 0 huérfanos en las 9 FK.
- `clases_impartidas`: 81 filas históricas **intactas** (autoría irrecuperable, T4).
- **PROFESORES**: 21 filas; la 21 es el rol **técnico** (`Permisos='Tecnico'`).

Lo que de aquí es un **pendiente** —68 filas sin `periodo_id`, claves compartidas,
`asignaciones_profesor` en 0, el SQL de justificación por clase— vive **solo** en
`docs/sistema/pendientes.json`, con su comando de verificación.

## 5b. Inscripciones y credenciales — decisiones cerradas

`inscripciones_alumno.decision_manual` congela la decisión humana por CURP y las
cuentas de profesor quedaron marcadas con `debe_cambiar_credenciales`. El **qué** está
en el GLOSARIO y en el código; el **relato** del cambio, en la BITACORA.

## 6. Pendiente humano (no lo puede hacer un agente)

**Fuente única: `docs/sistema/pendientes.json`** — la que lee y renderiza
`npm run panel`. Cada entrada lleva riesgo, quién y su comando `verificar`. Aquí no
se duplica (R6): el texto anterior de esta sección, con sus mediciones, se conserva
en `docs/historial/BITACORA-2026-09.md`. Antes de apoyarse en un pendiente, correr
su `verificar`.
## 7. Estructura del repositorio

Dónde va cada cosa: `docs/normativo/ORDEN.md`.

```
app/      actions/ · components/ (paneles) · components/ui/ (primitivas) · components/oceano/ (shell)
lib/      escolar/<7 familias> + transversales en la raíz · auth/ · supabase/
scripts/  vivos · _peligrosos/ (no ejecutar) · _archivo/ (no re-ejecutar)
docs/     normativo/ (obliga) · sistema/ (el presente) · historial/ (el pasado)
```

Red de pruebas: **40 suites** y un workflow de CI que las corre junto a tipos, lint,
permisos y build (`.github/workflows/verificacion.yml` es la lista viva).

**Una de las 40 no prueba un módulo: prueba el REPO.** `scripts/test-orden.mjs` es la
mitad mecánica de `ORDEN.md` —capas, scripts, raíz, tamaño de archivo, composición de
UI y entrada validada— y existe porque esas reglas eran prosa en un repo que tocan dos
agentes de IA. Correrlo dice en qué estado está cada regla; el histórico de lo que
cerró, en `MAPA-DEL-SISTEMA.md` §2b.

Desde el 2026-09-19 el CI también vigila **la documentación**, no solo el código:
`scripts/verificar-docs.mjs` falla si un documento del presente cita un archivo
retirado o si la lectura de arranque pasa de su techo de tokens. Misma razón que
las otras dos verificaciones: una regla que nada comprueba se degrada sola.

**Cómo se llegó hasta aquí → `docs/historial/BITACORA-2026-09.md`.**

## 8. Cómo se valida un cambio

```bash
npx tsc --noEmit
npm run build
node scripts/<la suite pura del módulo>.mjs   # ver scripts/README.md
```
Si tocaste un módulo puro, antes de la suite: `npm run test:compilar`.

Checklist completo de aceptación: `docs/normativo/CONTRATO-DE-CAMBIO.md`.
