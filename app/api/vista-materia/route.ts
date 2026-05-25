import { NextRequest, NextResponse } from "next/server";
import { actionObtenerVistaMateria } from "@/app/actions/escolar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nombre = request.nextUrl.searchParams.get("nombre")?.trim() ?? "";
  const curp = request.nextUrl.searchParams.get("curp")?.trim() || null;

  if (!nombre) {
    return NextResponse.json(
      { error: "Falta el parámetro nombre." },
      { status: 400 },
    );
  }

  try {
    const vista = await actionObtenerVistaMateria(nombre, curp);
    return NextResponse.json(vista, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar la materia.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
