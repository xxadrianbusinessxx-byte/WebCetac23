import { NextRequest, NextResponse } from "next/server";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import {
  eliminarNoticiaInicioEnCloudinary,
  esSlotEventoValido,
  listarUrlsNoticiasInicio,
} from "@/lib/cloudinary/noticias";
import { asegurarHttpsEnUrlsNoticias } from "@/lib/urls/seguras";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const urls = await listarUrlsNoticiasInicio();
    return NextResponse.json(asegurarHttpsEnUrlsNoticias(urls), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al cargar noticias.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const sesion = await obtenerSesionPortal();
  if (sesion?.rol !== "directivo") {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const slotRaw = Number(request.nextUrl.searchParams.get("slot") ?? "0");
  if (!esSlotEventoValido(slotRaw)) {
    return NextResponse.json({ error: "Slot no válido." }, { status: 400 });
  }

  const resultado = await eliminarNoticiaInicioEnCloudinary(slotRaw);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
