// Firma y lectura del token de sesión. Sin acceso a base de datos: lo usa también proxy.ts.
import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESION = "jos_sesion";
export const DURACION_SESION_S = 60 * 60 * 24 * 30;

function secreto() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Falta AUTH_SECRET (mínimo 32 caracteres).");
    }
    return new TextEncoder().encode("solo-para-desarrollo-local-no-usar-en-produccion");
  }
  return new TextEncoder().encode(s);
}

export type Sesion = { uid: string; v: number };

export async function firmarSesion(s: Sesion) {
  return new SignJWT({ v: s.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.uid)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_S}s`)
    .sign(secreto());
}

export async function leerToken(token: string | undefined): Promise<Sesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.v !== "number") return null;
    return { uid: payload.sub, v: payload.v };
  } catch {
    return null;
  }
}
