import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, usuarios, PREFS_INICIALES, type Prefs } from "./db";
import { COOKIE_SESION, DURACION_SESION_S, firmarSesion, leerToken } from "./sesion";

export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  prefs: Prefs;
  tokenCalendario: string;
};

export function prefsCompletas(p: Partial<Prefs> | null | undefined): Prefs {
  return {
    diasAnticipacion: p?.diasAnticipacion ?? PREFS_INICIALES.diasAnticipacion,
    avisos: { ...PREFS_INICIALES.avisos, ...p?.avisos },
    correo: { ...PREFS_INICIALES.correo, ...p?.correo },
  };
}

export async function iniciarSesion(uid: string, version: number) {
  const token = await firmarSesion({ uid, v: version });
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_SESION_S,
  });
}

export async function cerrarSesion() {
  (await cookies()).delete(COOKIE_SESION);
}

/** Usuario de la sesión actual, o null. Se consulta una sola vez por pedido. */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const sesion = await leerToken((await cookies()).get(COOKIE_SESION)?.value);
  if (!sesion) return null;
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, sesion.uid)).limit(1);
  // Cambiar la contraseña sube la versión y deja sin efecto las sesiones anteriores.
  if (!u || u.versionSesion !== sesion.v) return null;
  return {
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    prefs: prefsCompletas(u.prefs),
    tokenCalendario: u.tokenCalendario,
  };
});

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect("/entrar");
  return u;
}

export const iaDisponible = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const correoDisponible = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
