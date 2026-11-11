import "server-only";

type Correo = {
  para: string;
  asunto: string;
  html: string;
  adjuntos?: { nombre: string; contenido: Buffer }[];
};

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const escaparHtml = esc;

/** Plantilla simple y legible en cualquier cliente de correo. */
export function plantilla(titulo: string, cuerpoHtml: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#FAF7F2;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#2B2F36">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:14px;color:#5C6470;margin:0 0 6px">Julitask</p>
<h1 style="font-size:22px;line-height:1.25;margin:0 0 18px;color:#14274A">${esc(titulo)}</h1>
<div style="font-size:16px;line-height:1.55">${cuerpoHtml}</div>
</div></body></html>`;
}

/** Envía por Resend. Devuelve false si el correo no está configurado o falla. */
export async function enviarCorreo(c: Correo): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY;
  const desde = process.env.EMAIL_FROM;
  if (!clave || !desde) return false;
  try {
    const r = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: desde,
        to: [c.para],
        subject: c.asunto,
        html: c.html,
        attachments: c.adjuntos?.map((a) => ({
          filename: a.nombre,
          content: a.contenido.toString("base64"),
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.error("Correo no enviado:", r.status, await r.text().catch(() => ""));
    return r.ok;
  } catch (e) {
    console.error("Correo no enviado:", e);
    return false;
  }
}
