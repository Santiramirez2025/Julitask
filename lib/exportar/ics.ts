import "server-only";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db, eventos, pagos } from "../db";
import { enZona, hoy, sumarDias, aInstante } from "../fechas";
import { plata } from "../dinero";

const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Las líneas de un .ics no pueden pasar de 75 bytes: se parten con un espacio de continuación. */
function plegar(linea: string) {
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  for (const ch of linea) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 73) {
      partes.push(actual);
      actual = " ";
      bytes = 1;
    }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join("\r\n");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dia = (f: string) => f.replace(/-/g, "");

/** Calendario con reuniones, tareas pendientes y vencimientos sin pagar. */
export async function calendarioICS(uid: string) {
  const desde = sumarDias(hoy(), -60);
  const [evs, pgs] = await Promise.all([
    db
      .select()
      .from(eventos)
      .where(and(eq(eventos.usuarioId, uid), isNull(eventos.borradoEl), gte(eventos.inicio, aInstante(desde))))
      .limit(2000),
    db
      .select()
      .from(pagos)
      .where(and(eq(pagos.usuarioId, uid), isNull(pagos.borradoEl), isNull(pagos.pagadoEl), gte(pagos.vence, desde)))
      .limit(1000),
  ]);

  const sello = utc(new Date());
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Julian OS//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Julián OS",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const e of evs) {
    if (e.tipo !== "reunion" && e.completadoEl) continue;
    const titulo =
      e.tipo === "reunion"
        ? e.persona ? `Reunión con ${e.persona}` : e.titulo || "Reunión"
        : e.titulo;
    lineas.push("BEGIN:VEVENT", `UID:${e.id}@julian-os`, `DTSTAMP:${sello}`);
    if (e.sinHora) {
      const f = enZona(e.inicio).fecha;
      lineas.push(`DTSTART;VALUE=DATE:${dia(f)}`, `DTEND;VALUE=DATE:${dia(sumarDias(f, 1))}`);
    } else {
      lineas.push(
        `DTSTART:${utc(e.inicio)}`,
        `DTEND:${utc(new Date(e.inicio.getTime() + e.duracionMin * 60_000))}`,
      );
    }
    lineas.push(`SUMMARY:${esc(titulo)}`);
    if (e.lugar) lineas.push(`LOCATION:${esc(e.lugar)}`);
    const descripcion = [e.tipo === "reunion" ? e.titulo : "", e.notas ?? ""].filter(Boolean).join("\n");
    if (descripcion) lineas.push(`DESCRIPTION:${esc(descripcion)}`);
    if (e.tipo === "reunion")
      lineas.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(titulo)}`, "TRIGGER:-PT30M", "END:VALARM");
    lineas.push("END:VEVENT");
  }

  for (const p of pgs) {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${p.id}@julian-os`,
      `DTSTAMP:${sello}`,
      `DTSTART;VALUE=DATE:${dia(p.vence)}`,
      `DTEND;VALUE=DATE:${dia(sumarDias(p.vence, 1))}`,
      `SUMMARY:${esc(`Vence: ${p.concepto} (${plata(p.importe, p.moneda)})`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return lineas.map(plegar).join("\r\n") + "\r\n";
}
