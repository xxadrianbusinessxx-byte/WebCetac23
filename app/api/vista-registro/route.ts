import { NextRequest, NextResponse } from "next/server";
import { actionObtenerVistaRegistro } from "@/app/actions/escolar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const nombre = request.nextUrl.searchParams.get("nombre")?.trim() ?? "";

  if (!nombre) {
    return NextResponse.json(
      { error: "Falta el parámetro nombre." },
      { status: 400 },
    );
  }

  try {
    const vista = await actionObtenerVistaRegistro(nombre);
    return NextResponse.json(vista, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar el registro.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
