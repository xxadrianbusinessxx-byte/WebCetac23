import type { Metadata } from "next";
import { Suspense } from "react";

export const dynamic = "force-dynamic";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import { PerfilClient } from "./perfil-client";

export const metadata: Metadata = {
  title: "AulaNube — Perfil",
  description: "Perfil del alumno: materias, estatus, comentarios y boleta.",
};

type Props = {
  searchParams: Promise<{
    modo?: string;
    curp?: string;
    alumno?: string;
    desde?: string;
  }>;
};

const MODOS_VALIDOS = ["directivo", "tutor", "maestro"] as const;
export type ModoPerfil = "alumno" | (typeof MODOS_VALIDOS)[number];

export default async function PerfilPage({ searchParams }: Props) {
  const params = await searchParams;
  const curpConsulta = params.curp ?? params.alumno ?? null;
  const datos = await actionObtenerPerfilAlumno(curpConsulta);
  const modoValido = MODOS_VALIDOS.find((m) => m === params.modo);
  const modo: ModoPerfil = modoValido ?? "alumno";

  // El modo es SOLO presentación; la autorización real se valida en la Server
  // Action (resolverAccesoAlumno). El vínculo de regreso refleja el rol.
  const urlRegreso =
    params.desde === "directivo" || modo === "directivo"
      ? "/directivo"
      : params.desde === "tutor" || modo === "tutor"
        ? "/tutor"
        : params.desde === "profesor" || modo === "maestro"
          ? "/profesor"
          : "/perfil";

  return (
    <Suspense fallback={null}>
      <PerfilClient
        materias={datos.materias}
        modo={modo}
        urlRegreso={urlRegreso}
        datos={datos}
      />
    </Suspense>
  );
}
