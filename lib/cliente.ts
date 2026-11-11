// Utilidades que corren en el navegador.

const LADO_MAX = 1800;

/** Achica fotos grandes antes de subirlas (las del celular pesan 5-10 MB). Los PDF pasan igual. */
export async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/") || archivo.size < 500_000) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => lienzo.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}

export async function subirArchivo(
  archivo: File,
  entidad: string,
  entidadId: string,
  esFoto = false,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("entidad", entidad);
    fd.append("entidadId", entidadId);
    if (esFoto) fd.append("esFoto", "si");
    const r = await fetch("/api/archivos", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error ?? "No se pudo subir el archivo." };
    return { ok: true, id: j.id };
  } catch {
    return { ok: false, error: "No se pudo subir el archivo. Revisá tu conexión." };
  }
}

type Reconocedor = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

/** Dictado por voz del navegador, si existe (Chrome, Safari, Edge). */
export function crearDictado(): Reconocedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, new () => Reconocedor>;
  const Clase = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Clase) return null;
  const r = new Clase();
  r.lang = "es-AR";
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}

export function hayDictado() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}
