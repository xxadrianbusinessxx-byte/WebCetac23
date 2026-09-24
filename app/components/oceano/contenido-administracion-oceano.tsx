"use client";

/**
 * contenido-administracion-oceano.tsx — monta las piezas de Administración escolar
 * (2026-09-24). Qué pieza va en cada hueco lo decide
 * `lib/navegacion/contenido-administracion.ts`; aquí solo se monta.
 *
 * No hay pantallas nuevas salvo la vista previa de la constancia. El expediente
 * son las piezas del alumno (`ContenidoAlumnoOceano`) con los datos del alumno
 * que se eligió en el buscador. Tutores, documentos y mensajes son los paneles
 * del técnico, y reportes y solicitudes de constancia, los del directivo. Cada
 * uno exige su capacidad en el servidor.
 */
import { AdministracionPanel } from "@/app/components/administracion-panel";
import { ConstanciaEstudiosVistaPrevia } from "@/app/components/constancia-estudios-vista-previa";
import { DocumentosPanel } from "@/app/components/documentos-panel";
import { MensajesInternosPanel } from "@/app/components/mensajes-internos-panel";
import { TutoresPanel } from "@/app/components/tutores-panel";
import { necesitaAlumno, type PiezaAdministracion } from "@/lib/navegacion/contenido-administracion";
import { ContenidoAlumnoOceano, type DatosAlumnoOceano } from "./contenido-alumno-oceano";

export type DatosAdministracionOceano = {
  /** Expediente del alumno elegido, resuelto por el servidor. null = ninguno abierto. */
  alumno: DatosAlumnoOceano | null;
  /** Nombre del ciclo operativo, para la constancia. */
  cicloOperativo: string;
};

function AvisoBuscarAlumno() {
  return (
    <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-6 text-center text-sm font-semibold text-[var(--oc-muted)]">
      Busca a un alumno por su nombre o CURP en el panel de la izquierda para abrir su expediente.
    </p>
  );
}

export function ContenidoAdministracionOceano({
  pieza,
  modo,
  datos,
}: {
  pieza: PiezaAdministracion;
  modo: string | null;
  datos: DatosAdministracionOceano;
}) {
  const alumno = datos.alumno;
  if (necesitaAlumno(pieza, modo) && !alumno) return <AvisoBuscarAlumno />;

  switch (pieza.tipo) {
    case "alumno":
      // Las MISMAS piezas que ven el alumno y su tutor. Sin justificar desde el
      // calendario: este rol consulta las justificaciones, no las solicita.
      return <ContenidoAlumnoOceano pieza={pieza.pieza} modo={modo} permitirJustificacion={false} datos={alumno!} />;

    case "constancias":
      if ((modo ?? "").startsWith("Solicitudes")) {
        return <AdministracionPanel pantalla="constancias" modo={modo} />;
      }
      return (
        <ConstanciaEstudiosVistaPrevia
          datos={{
            nombre: alumno!.nombre,
            curp: alumno!.curp,
            matricula: alumno!.clave,
            grado: alumno!.registro.grado,
            grupo: alumno!.registro.grupo,
            carrera: alumno!.registro.carrera,
            ciclo: datos.cicloOperativo,
          }}
        />
      );

    case "reportes":
      return (
        <AdministracionPanel
          pantalla="reportes"
          modo={modo}
          alumno={alumno ? { curp: alumno.curp, nombre: alumno.nombre } : null}
        />
      );

    case "tutores":
      return <TutoresPanel />;

    case "documentos":
      return <DocumentosPanel />;

    case "mensajes-internos":
      return <MensajesInternosPanel />;
  }
}
