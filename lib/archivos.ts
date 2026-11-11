import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, pagos, gastosObra, clientes, inmuebles } from "./db";
import { esId } from "./entidades";

export const TAMANO_MAX = 4 * 1024 * 1024; // el límite de subida de Vercel es 4,5 MB

const FIRMAS: { mime: string; ok: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", ok: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "application/pdf", ok: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
];

/** Tipo real del archivo según su contenido, sin confiar en lo que declara el navegador. */
export function tipoReal(b: Buffer) {
  return FIRMAS.find((f) => f.ok(b))?.mime ?? null;
}

export const ENTIDADES_ARCHIVO = ["pago", "gasto", "cliente", "inmueble"] as const;
export type EntidadArchivo = (typeof ENTIDADES_ARCHIVO)[number];

export async function entidadEsMia(entidad: string, id: unknown, uid: string) {
  if (!esId(id)) return false;
  const tabla =
    entidad === "pago" ? pagos
    : entidad === "gasto" ? gastosObra
    : entidad === "cliente" ? clientes
    : entidad === "inmueble" ? inmuebles
    : null;
  if (!tabla) return false;
  const [f] = await db
    .select({ id: tabla.id })
    .from(tabla)
    .where(and(eq(tabla.id, id), eq(tabla.usuarioId, uid), isNull(tabla.borradoEl)))
    .limit(1);
  return Boolean(f);
}

/** Rechaza pedidos que no vienen de la propia app (protección CSRF para subidas). */
export function mismoOrigen(req: Request) {
  const origen = req.headers.get("origin");
  if (!origen) return false;
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origen).host === host;
  } catch {
    return false;
  }
}
