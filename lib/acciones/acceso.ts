"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, usuarios, recuperaciones, registro } from "../db";
import { cerrarSesion, iniciarSesion, correoDisponible } from "../auth";
import { enviarCorreo, plantilla } from "../correo";

export type EstadoAcceso = { error?: string; aviso?: string } | undefined;

const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 15;
// Hash de relleno: iguala el tiempo de respuesta cuando el email no existe.
const HASH_FALSO = "$2b$12$l7BcCdZBN7iDIkS65CQwK.dre51zqVV9.wy6LxokoZH7ulRQsD8H.";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function entrar(_: EstadoAcceso, form: FormData): Promise<EstadoAcceso> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const clave = String(form.get("clave") ?? "");
  if (!email || !clave) return { error: "Completá tu email y tu contraseña." };

  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (u?.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    return { error: `Demasiados intentos. Probá de nuevo en ${BLOQUEO_MIN} minutos.` };
  }
  const coincide = await bcrypt.compare(clave, u?.claveHash ?? HASH_FALSO);
  if (!u || !coincide) {
    if (u) {
      const intentos = u.intentosFallidos + 1;
      await db
        .update(usuarios)
        .set({
          intentosFallidos: intentos >= MAX_INTENTOS ? 0 : intentos,
          bloqueadoHasta: intentos >= MAX_INTENTOS ? new Date(Date.now() + BLOQUEO_MIN * 60_000) : null,
        })
        .where(eq(usuarios.id, u.id));
    }
    return { error: "El email o la contraseña no coinciden." };
  }
  await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, u.id));
  await iniciarSesion(u.id, u.versionSesion);
  redirect("/");
}

export async function salir() {
  await cerrarSesion();
  redirect("/entrar");
}

export async function pedirRecuperacion(_: EstadoAcceso, form: FormData): Promise<EstadoAcceso> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escribí tu email." };
  if (!correoDisponible()) {
    return {
      error: "El envío de correos todavía no está configurado. Pedile a quien administra la app que restablezca tu contraseña.",
    };
  }
  const [u] = await db.select().from(usuarios).where(eq(usuarios.email, email)).limit(1);
  if (u) {
    // Máximo 3 pedidos vigentes por hora, para que nadie use esto para llenar la casilla.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(recuperaciones)
      .where(and(eq(recuperaciones.usuarioId, u.id), gt(recuperaciones.expira, new Date())));
    if (n < 3) {
      const token = randomBytes(32).toString("hex");
      await db.insert(recuperaciones).values({
        usuarioId: u.id,
        tokenHash: sha(token),
        expira: new Date(Date.now() + 60 * 60_000),
      });
      const h = await headers();
      const base =
        process.env.APP_URL?.replace(/\/$/, "") ||
        `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
      const enlace = `${base}/restablecer?token=${token}`;
      await enviarCorreo({
        para: u.email,
        asunto: "Restablecer tu contraseña de Julitask",
        html: plantilla(
          "Restablecer contraseña",
          `<p>Tocá el botón para elegir una contraseña nueva. El enlace vale por una hora.</p>
<p><a href="${enlace}" style="display:inline-block;background:#14274A;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:600">Elegir contraseña nueva</a></p>
<p style="color:#5C6470;font-size:14px">Si no lo pediste vos, no hace falta que hagas nada.</p>`,
        ),
      });
    }
  }
  // Misma respuesta exista o no la cuenta.
  return { aviso: "Si ese email tiene cuenta, en unos minutos te llega un correo con el enlace." };
}

export async function restablecer(_: EstadoAcceso, form: FormData): Promise<EstadoAcceso> {
  const token = String(form.get("token") ?? "");
  const clave = String(form.get("clave") ?? "");
  if (clave.length < 10 || clave.length > 200)
    return { error: "La contraseña tiene que tener al menos 10 caracteres." };
  const [r] = await db
    .select()
    .from(recuperaciones)
    .where(
      and(
        eq(recuperaciones.tokenHash, sha(token)),
        isNull(recuperaciones.usadoEl),
        gt(recuperaciones.expira, new Date()),
      ),
    )
    .limit(1);
  if (!r) return { error: "El enlace venció o ya se usó. Pedí uno nuevo." };

  const [u] = await db
    .update(usuarios)
    .set({
      claveHash: await bcrypt.hash(clave, 12),
      versionSesion: sql`${usuarios.versionSesion} + 1`,
      intentosFallidos: 0,
      bloqueadoHasta: null,
    })
    .where(eq(usuarios.id, r.usuarioId))
    .returning({ id: usuarios.id, v: usuarios.versionSesion });
  await db.update(recuperaciones).set({ usadoEl: new Date() }).where(eq(recuperaciones.usuarioId, r.usuarioId));
  await db.insert(registro).values({
    usuarioId: u.id, accion: "restableció", entidad: "contraseña", resumen: "",
  });
  await iniciarSesion(u.id, u.v);
  redirect("/");
}
