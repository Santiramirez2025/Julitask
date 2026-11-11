import { NextResponse } from "next/server";
import { usuarioActual, iaDisponible } from "@/lib/auth";
import { TAMANO_MAX, tipoReal, mismoOrigen } from "@/lib/archivos";
import { leerFacturaConIA } from "@/lib/asistente/ia";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Lee una factura y devuelve datos sugeridos. No guarda nada: el usuario revisa y decide.
export async function POST(req: Request) {
  if (!mismoOrigen(req)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Tu sesión venció. Volvé a entrar." }, { status: 401 });
  if (!iaDisponible())
    return NextResponse.json({ error: "La lectura automática no está activada." }, { status: 503 });

  let archivo: FormDataEntryValue | null;
  try {
    archivo = (await req.formData()).get("archivo");
  } catch {
    return NextResponse.json({ error: "El archivo es demasiado pesado (máximo 4 MB)." }, { status: 413 });
  }
  if (!(archivo instanceof File) || archivo.size === 0 || archivo.size > TAMANO_MAX)
    return NextResponse.json({ error: "No se pudo leer el archivo." }, { status: 400 });
  const datos = Buffer.from(await archivo.arrayBuffer());
  const mime = tipoReal(datos);
  if (!mime) return NextResponse.json({ error: "Solo fotos (JPG, PNG) o PDF." }, { status: 415 });

  try {
    return NextResponse.json(await leerFacturaConIA(datos, mime));
  } catch (e) {
    console.error("Lectura de factura:", e);
    return NextResponse.json(
      { error: "No pude leer la factura. Completá los datos a mano." },
      { status: 502 },
    );
  }
}
