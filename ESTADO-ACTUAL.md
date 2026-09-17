# ESTADO ACTUAL — qué es verdad hoy

Este archivo sustituye a `contexto.feliz` como lectura de arranque. El detalle
histórico —`contexto.feliz.md`, y todo `docs/historial/`— **no describe el presente**.

Regla de mantenimiento: **este archivo se actualiza en el mismo cambio que lo vuelve
falso.** Si crece más de ~150 líneas, lo que sobra es historial y va a `docs/historial/`.

- **Última revisión:** 2026-09-16 (PROMPT E: el I/O baja a `lib/` y C8/C9 pasan a regla dura)
- **HEAD:** `d71fd59` (2026-09-16) · árbol limpio

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

Las tres, con su manifestación y ubicación, están en
`docs/sistema/MAPA-DEL-SISTEMA.md` §2. En resumen:

1. **Calendario con dos identidades** — tras PROMPT-1/T2 el calendario del
   operativo cuelga de `periodo_id` (bucket canónico `SEMESTRE AGO26-ENE27`,
   77 filas, ligadas a `7cf5cca7`). La columna texto `ciclo_escolar`
   (`@deprecated`) se conserva como legado (R8) y ya no se escribe por ella.
2. **Identidad del profesor** — 16 de 20 comparten CLAVE `4321`; `profesor_clave` queda como columna legacy.
3. **Una tabla física por materia** — nombres en texto, columnas creadas en caliente por RPC.

Ninguna se cierra «de paso»: cada una necesita su propia migración verificada (R8).

## 4. Seguridad — cómo está realmente

- Sesión: cookie httpOnly firmada con HMAC-SHA256, 7 días (`lib/auth/session.ts`).
- Tutores: scrypt + `timingSafeEqual`. Contraseña inicial derivada del CURP del hijo.
- **RLS no autoriza nada.** Las policies son `*_all USING (true)`. La autorización real
  vive en TypeScript. Desde el PROMPT-2, la decisión «qué puede un rol» está
  centralizada en `lib/auth/permisos.ts` (`exigir()` al inicio de cada Server Action);
  las decisiones de alcance «sobre quién» se conservan ortogonales
  (`resolverAccesoAlumno`, `nivelAccesoProfesor`). Es una decisión consciente, pero
  significa que **un bug de autorización en TS es un bug de seguridad sin red debajo**.
- **Rediseño Océano · Fase 0 (2026-09-10) — decisión viva, no narración.** El conjunto
  `directivo` ganó tres capacidades del de `maestro` (`asistencia.subir`, `ciclo.ver`,
  `justificacion.solicitar`) para sostener un rol de supervisión global sin asignaciones
  (R-4). Es aditivo: ningún rol perdió nada. Consecuencia intencionada y anotada:
  directivo puede **solicitar y aprobar** la misma justificación. El relato del cambio y
  las tres filas anteriores → `docs/historial/BITACORA-2026-09.md`.
- Todo `scripts/` corre con `service_role` y salta RLS. No hay entorno de staging.

## 5. Estado de datos — última medición conocida

> Cifras medidas el **2026-09-06**; antes de apoyarse en cualquiera, volver a correr el script que las produjo.

- **Un solo periodo**: `2026-2027` (`7cf5cca7`), operativo.
- Grupos / materias activas / inscripciones activas / bloques de horario:
  **24 / 241 / 357 / 168**. **0 CURPs con más de una inscripción activa.**
- Calendario del operativo: **77 filas** ligadas por `periodo_id` (73 clase,
  3 descanso, 1 festivo).
- `asistencia_alumnos`: **3 863 filas** → **3 795 con `periodo_id`**; 68 históricas
  fuera del rango quedan NULL (se reportan, no se inventó). 0 huérfanos en las 9 FK.
- `clases_impartidas`: 81 filas históricas **intactas** (autoría irrecuperable, T4).
- `justificaciones_asistencia`: falta aplicar `agregar-grupo-materia-justificaciones.sql`
  para la justificación por clase con `grupo_materia_id`.
- **PROFESORES**: 21 filas; la 21 es el rol **técnico** (`Permisos='Tecnico'`, clave
  inicial `TECNICO26`). 15 de 21 siguen compartiendo clave ⇒ pendiente humano.
- `asignaciones_profesor`: **0 filas** (el DDL C4.11 está aplicado): estrenar el
  traspaso es tarea operativa del técnico desde la web.

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

Reorganizado el 2026-09-06. Dónde va cada cosa: `docs/normativo/ORDEN.md`.

```
app/      actions/ · components/ (paneles) · components/ui/ (primitivas) · components/oceano/ (shell)
app/oceano/  previsualización del shell Océano (no sustituye a ninguna ruta viva)
lib/      escolar/<7 familias> + transversales en la raíz · auth/ · supabase/
scripts/  vivos · _peligrosos/ (no ejecutar) · _archivo/ (no re-ejecutar)
docs/     normativo/ (obliga) · sistema/ (el presente) · historial/ (el pasado)
```
**Las carpetas `_borrador/` ya no existen** (PROMPT F, 2026-09-16): sus 21 archivos se
resolvieron uno por uno, con la decisión escrita en `scripts/_archivo/borrador/README.md`.

Red de pruebas: **37 suites**, 0 fallos; `npx tsc --noEmit` en 0 errores;
`next build` completa con **9 rutas**.
`test-permisos.mjs` compara el código contra la §4 de
`docs/sistema/MATRIZ-PERMISOS.md` con los **5 roles** (475 checks).
Desde PROMPT-5/B6 hay un runner único (`npm run test:suites` →
`scripts/correr-todas-las-suites.mjs`) y un workflow de CI
(`.github/workflows/verificacion.yml`: tsc · compilar · suites ·
permisos · gen:matriz --check · verificar:estado · build).
**La 37.ª no prueba un módulo: prueba el REPO.** `scripts/test-orden.mjs` es la
mitad mecánica de `docs/normativo/ORDEN.md`: capas, nombres, scripts y raíz, sobre
el archivo con comentarios y literales neutralizados. Existe porque las reglas de
capas eran prosa y este repo lo tocan dos agentes de IA. Diez reglas: siete DURAS
(C1–C7) y **C8 y C9, que pasaron a duras al ejecutarse el PROMPT E** — ninguna
action habla con Supabase y ningún archivo pasa de 1 000 líneas (informe:
`docs/historial/informes/INFORME-PROMPT-E-CAPAS-Y-TAMANO.md`). C10 sigue de
trinquete (35 scripts sin fila en `scripts/README.md`).

**Cómo se llegó hasta aquí → `docs/historial/BITACORA-2026-09.md`.**
## 8. Cómo se valida un cambio

```bash
npx tsc --noEmit
npm run build
node scripts/<la suite pura del módulo>.mjs   # ver scripts/README.md
```
Si tocaste un módulo puro, antes de la suite: `npm run test:compilar`.

Checklist completo de aceptación: `docs/normativo/CONTRATO-DE-CAMBIO.md`.
