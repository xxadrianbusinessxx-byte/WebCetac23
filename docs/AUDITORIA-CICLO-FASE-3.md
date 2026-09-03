# FASE 3 — ALUMNOS AL CICLO BORRADOR (informe de auditoría)

Rama: `feature/ciclo-f1-f7-sin-push` · Fecha: 2026-09-03

## Estado: PENDING (auditoría + contrato listos; parametrización `periodoId` pendiente)

### Decisión de producto (documentada)
- F2 queda BLOCKED respecto a importar estructura académica desde Excel (el
  pipeline no crea grupos/materias).
- La estructura académica del BORRADOR se obtiene mediante **clonación**
  (`actionClonarContextoAcademico`, ya en `PasoAcademico`).
- El Excel se usa únicamente para **roster/inscripciones** de alumnos (pipeline
  `actionPrevisualizar/AplicarCargaAcademica`), que resuelve grupos ya existentes.

### Arquitectura encontrada (VERIFICADO EN CÓDIGO)
- `lib/escolar/carga-academica.ts`: roster de alumnos por CURP; parsea con
  `archivoCsvAFilas`; detecta/valida grupos existentes del contexto
  (`gruposInexistentes`, `ambiguos`, `conflictosAcademicos`); preview con
  `bloqueaEscritura` y confirmación por acción separada.
- `inscripciones-admin.ts` + `inscripciones-borrador.ts`: inscripción por
  `periodoId`/grupo (BORRADOR → activo=false).
- `PasoAlumnos`: actualmente búsqueda manual CURP→grupo→`actionInscribirAlumnoEnCiclo`
  (funciona, por periodo); NO integra aún el CSV con preview/confirmación.

### Identidad `periodo_id` (estado)
- `PasoAlumnos` recibe `periodoId`. El pipeline roster **todavía resuelve el
  contexto por `periodoNombre`/operativo** (`extraerContexto` en la action).
- Para cumplir F3 falta **parametrizar el pipeline** (contexto `{ periodoId }`
  destino) con regla: si `periodoId` está presente → usarlo directo (BORRADOR
  permitido, HISTORICO rechazado); si no → comportamiento legacy actual.
- Sin esa parametrización no se puede garantizar que un BORRADOR (no operativo)
  reciba el roster.

### Casos 1–4 (contrato a garantizar al cerrar)
1. Inscrito en destino → no duplicar (ya cubierto por upsert/reglas existentes).
2. Existe globalmente sin inscripción en destino → crear inscripción en destino.
3. CURP inexistente → clasificar `alumnoNoEncontrado` y NO inventar CRUD nuevo
   (requiere verificar operación oficial de alta de ALUMNOS).
4. Inscrito en otro ciclo → NO modificar otro ciclo (aislamiento por `periodo_id`).

### Grupos / Carreras
Grupos y carreras NO se crean desde Excel; se resuelven dentro del `periodoId`
destino. Reglas existentes (1RO sin carrera) respetadas por el dominio actual.

### Preview/Confirm
Separación existente en el pipeline (preview SOLO LECTURA; escritura solo en la
acción de aplicar). Falta la UI dentro de `PasoAlumnos`.

### Autorización / Activación
Autorización directivo intacta en las actions existentes. F3 no activa (F8 no se
toca). F7 (`validarIntegridadCiclo`) sigue siendo la autoridad única.

### Tests
```text
test-auditoria-ciclo-f3.mjs    13/13 PASS (estáticos; estado real + GAP)
```
Sin tests funcionales de casos 1–4 aún: requieren la parametrización de F3.

### SQL ejecutado
NINGUNO.

### Riesgos reales restantes
1. Parametrizar `ContextoAcademico` + actions + dominio con `periodoId` destino
   (BORRADOR/OPERATIVO permitidos, HISTORICO rechazado; sin resolución por
   nombre cuando hay ID).
2. Integrar UI de preview/confirm en `PasoAlumnos` reutilizando el formato de
   preview existente.
3. Confirmar si existe operación oficial de alta de ALUMNOS (Caso 3) antes de
   permitir creación automática.
4. Verificación real (F9/F10) pendiente.
