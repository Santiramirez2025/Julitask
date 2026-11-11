import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, usuarios } from "@/lib/db";
import { calendarioICS } from "@/lib/exportar/ics";

export const dynamic = "force-dynamic";

// Calendario para suscribirse desde Google Calendar o el iPhone.
// No usa sesión: el enlace lleva un token secreto y largo que se puede regenerar desde Ajustes.
export async function GET(_: Request, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{48}$/.test(token)) return new NextResponse("No existe", { status: 404 });
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.tokenCalendario, token)).limit(1);
  if (!u) return new NextResponse("No existe", { status: 404 });
  return new NextResponse(await calendarioICS(u.id), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=900",
    },
  });
}
