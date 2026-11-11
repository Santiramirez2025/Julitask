import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, archivos } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { esId } from "@/lib/entidades";

export const dynamic = "force-dynamic";

// Los archivos son privados: solo se entregan con sesión y solo al dueño.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const { id } = await ctx.params;
  if (!esId(id)) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const [f] = await db
    .select()
    .from(archivos)
    .where(and(eq(archivos.id, id), eq(archivos.usuarioId, u.id)))
    .limit(1);
  if (!f) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const nombre = encodeURIComponent(f.nombre);
  return new NextResponse(new Uint8Array(f.datos), {
    headers: {
      "Content-Type": f.mime,
      "Content-Length": String(f.datos.length),
      "Content-Disposition": `inline; filename*=UTF-8''${nombre}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
