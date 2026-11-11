import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerToken } from "./lib/sesion";

// Primera barrera: sin sesión válida no se llega a ninguna pantalla ni dato.
// (Cada página y cada acción vuelven a verificar la sesión contra la base.)
const PUBLICAS = ["/entrar", "/recuperar", "/restablecer", "/sin-conexion"];
const API_PUBLICAS = ["/api/cron/", "/api/calendario/", "/api/salud"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (API_PUBLICAS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const sesion = await leerToken(req.cookies.get(COOKIE_SESION)?.value);
  const publica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!sesion && !publica) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
    return NextResponse.redirect(new URL("/entrar", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|iconos/|sw.js|manifest.webmanifest).*)"],
};
