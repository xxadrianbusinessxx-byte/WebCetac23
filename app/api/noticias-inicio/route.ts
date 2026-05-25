import { NextResponse } from "next/server";
import { listarUrlsNoticiasInicio } from "@/lib/cloudinary/noticias";
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
