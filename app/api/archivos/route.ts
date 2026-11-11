import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, archivos } from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { TAMANO_MAX, tipoReal, entidadEsMia, mismoOrigen } from "@/lib/archivos";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "El archivo es demasiado pesado (máximo 4 MB)." }, { status: 413 });
  }
  const archivo = form.get("archivo");
  const entidad = String(form.get("entidad") ?? "");
  const entidadId = String(form.get("entidadId") ?? "");
  if (!(archivo instanceof File)) return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
  if (archivo.size === 0) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
  if (archivo.size > TAMANO_MAX)
    return NextResponse.json({ error: "El archivo es demasiado pesado (máximo 4 MB)." }, { status: 413 });
  if (!(await entidadEsMia(entidad, entidadId, u.id)))
    return NextResponse.json({ error: "No se encontró dónde guardarlo." }, { status: 404 });

  const datos = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoReal(datos);
  if (!mime)
    return NextResponse.json({ error: "Solo se pueden subir fotos (JPG, PNG) o PDF." }, { status: 415 });

  const nombre = (archivo.name || "archivo").replace(/[\\/\u0000-\u001f]/g, "").slice(0, 120) || "archivo";
  const [f] = await db
    .insert(archivos)
    .values({
      usuarioId: u.id, entidad, entidadId, nombre, mime, tamano: datos.length, datos,
      esFoto: form.get("esFoto") === "si" && mime.startsWith("image/"),
    })
    .returning({ id: archivos.id });
  revalidatePath("/", "layout");
  return NextResponse.json({ id: f.id, nombre, mime });
}
