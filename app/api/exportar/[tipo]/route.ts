import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { Readable } from "node:stream";
import JSZip from "jszip";
import {
  db, pagos, eventos, clientes, inmuebles, obras, gastosObra, visitas, intereses, archivos, registro,
} from "@/lib/db";
import { usuarioActual } from "@/lib/auth";
import { tablaPagos, tablaAgenda, tablaClientes, tablaInmuebles, tablasObras, type Tabla } from "@/lib/exportar/tablas";
import { aCSV, aXLSX, aPDF, fichaPDF, nombreArchivo } from "@/lib/exportar/formatos";
import { calendarioICS } from "@/lib/exportar/ics";
import { esId, etiquetaDe, ESTADOS_INMUEBLE } from "@/lib/entidades";
import { fechaLarga, hoy } from "@/lib/fechas";
import { plata } from "@/lib/dinero";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TIPOS_MIME = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  ics: "text/calendar; charset=utf-8",
  zip: "application/zip",
};

function descarga(cuerpo: Buffer | string, nombre: string, ext: keyof typeof TIPOS_MIME) {
  const datos = typeof cuerpo === "string" ? Buffer.from(cuerpo, "utf8") : cuerpo;
  return new NextResponse(new Uint8Array(datos), {
    headers: {
      "Content-Type": TIPOS_MIME[ext],
      "Content-Disposition": `attachment; filename="${nombreArchivo(nombre, ext)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "archivo";

export async function GET(req: NextRequest, ctx: { params: Promise<{ tipo: string }> }) {
  const u = await usuarioActual();
  if (!u) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const { tipo } = await ctx.params;
  const q = req.nextUrl.searchParams;
  const formato = q.get("formato") ?? "xlsx";
  const subtitulo = `${u.nombre} · ${fechaLarga(hoy())}`;

  const entregar = async (nombre: string, titulo: string, tablas: Tabla[]) => {
    if (formato === "csv") return descarga(aCSV(tablas[tablas.length - 1]), nombre, "csv");
    if (formato === "pdf") return descarga(await aPDF(titulo, subtitulo, tablas), nombre, "pdf");
    return descarga(await aXLSX(tablas), nombre, "xlsx");
  };

  switch (tipo) {
    case "pagos": {
      const t = await tablaPagos(u.id, "personal");
      return entregar("pagos", t.titulo, [t]);
    }
    case "impuestos": {
      const t = await tablaPagos(u.id, "impuesto");
      return entregar("impuestos", t.titulo, [t]);
    }
    case "agenda": {
      if (formato === "ics") return descarga(await calendarioICS(u.id), "agenda", "ics");
      const t = await tablaAgenda(u.id);
      return entregar("agenda", t.titulo, [t]);
    }
    case "clientes": {
      const t = await tablaClientes(u.id);
      return entregar("clientes", t.titulo, [t]);
    }
    case "inmuebles": {
      const t = await tablaInmuebles(u.id);
      return entregar("inmuebles", t.titulo, [t]);
    }
    case "obras": {
      const obraId = q.get("obra");
      if (obraId && !esId(obraId)) return NextResponse.json({ error: "Obra inválida" }, { status: 400 });
      const tablas = await tablasObras(u.id, obraId ?? undefined);
      if (obraId && !tablas[0].filas.length) return NextResponse.json({ error: "No existe" }, { status: 404 });
      const nombre = obraId ? `obra-${tablas[0].filas[0][0]}` : "obras";
      return entregar(nombre, obraId ? tablas[1].titulo : "Obras", obraId ? [tablas[1]] : tablas);
    }
    case "contador": {
      // Año calendario en curso: impuestos y pagos con su estado, para pasarle al contador.
      const anio = hoy().slice(0, 4);
      const rango = { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
      const tablas = [await tablaPagos(u.id, "impuesto", rango), await tablaPagos(u.id, "personal", rango)];
      return entregar(`resumen-contador-${anio}`, `Resumen para el contador · ${anio}`, tablas);
    }
    case "ficha": {
      const id = q.get("id");
      if (!esId(id)) return NextResponse.json({ error: "Inmueble inválido" }, { status: 400 });
      const [i] = await db.select().from(inmuebles)
        .where(and(eq(inmuebles.id, id), eq(inmuebles.usuarioId, u.id), isNull(inmuebles.borradoEl))).limit(1);
      if (!i) return NextResponse.json({ error: "No existe" }, { status: 404 });
      const fotos = await db
        .select({ datos: archivos.datos, mime: archivos.mime })
        .from(archivos)
        .where(and(eq(archivos.usuarioId, u.id), eq(archivos.entidad, "inmueble"), eq(archivos.entidadId, id), eq(archivos.esFoto, true)))
        .orderBy(asc(archivos.creadoEl));
      const foto = fotos.find((f) => f.mime === "image/jpeg" || f.mime === "image/png") ?? null;
      const pdf = await fichaPDF({
        nombre: i.nombre,
        tipo: i.tipo,
        estado: etiquetaDe(ESTADOS_INMUEBLE, i.estado),
        direccion: i.direccion,
        precio: i.precio ? plata(i.precio, i.moneda) : null,
        superficie: i.superficie ? `${Number(i.superficie).toLocaleString("es-AR")} m²` : null,
        observaciones: i.observaciones,
        contacto: `${u.nombre} · ${u.email}`,
        foto,
      });
      return descarga(pdf, `ficha-${i.nombre}`, "pdf");
    }
    case "todo": {
      const con = (t: { usuarioId: PgColumn }) => eq(t.usuarioId, u.id);
      const [p, e, c, i, o, g, v, a, r] = await Promise.all([
        db.select().from(pagos).where(con(pagos)),
        db.select().from(eventos).where(con(eventos)),
        db.select().from(clientes).where(con(clientes)),
        db.select().from(inmuebles).where(con(inmuebles)),
        db.select().from(obras).where(con(obras)),
        db.select().from(gastosObra).where(con(gastosObra)),
        db.select().from(visitas).where(con(visitas)),
        db.select().from(archivos).where(con(archivos)),
        db.select().from(registro).where(con(registro)),
      ]);
      const ids = c.map((x) => x.id);
      const vinculos = ids.length ? await db.select().from(intereses).where(inArray(intereses.clienteId, ids)) : [];

      const zip = new JSZip();
      const [tObras, tGastos] = await tablasObras(u.id);
      const planillas = [
        await tablaPagos(u.id, "personal"), await tablaPagos(u.id, "impuesto"), await tablaAgenda(u.id),
        await tablaClientes(u.id), await tablaInmuebles(u.id), tObras, tGastos,
      ];
      zip.file("Julitask.xlsx", await aXLSX(planillas));
      for (const t of planillas) zip.file(`planillas/${slug(t.nombre)}.csv`, aCSV(t));

      const usados = new Set<string>();
      const indice = a.map((f) => {
        let ruta = `archivos/${f.entidad}/${f.creadoEl.toISOString().slice(0, 10)}_${slug(f.nombre)}`;
        if (usados.has(ruta)) ruta = ruta.replace(/(\.[a-z0-9]+)?$/i, `_${f.id.slice(0, 6)}$1`);
        usados.add(ruta);
        zip.file(ruta, f.datos);
        return { id: f.id, entidad: f.entidad, entidadId: f.entidadId, nombre: f.nombre, mime: f.mime, esFoto: f.esFoto, ruta };
      });
      zip.file(
        "datos.json",
        JSON.stringify(
          {
            version: 1,
            exportado: new Date().toISOString(),
            usuario: { nombre: u.nombre, email: u.email },
            pagos: p, eventos: e, clientes: c, inmuebles: i, obras: o, gastosObra: g, visitas: v,
            intereses: vinculos, archivos: indice, registro: r,
          },
          null,
          2,
        ),
      );
      zip.file(
        "LEEME.txt",
        [
          `Copia completa de Julitask — ${fechaLarga(hoy())}`,
          "",
          "Julitask.xlsx   Todo en un Excel, una hoja por tema.",
          "planillas/       Lo mismo en archivos CSV separados.",
          "archivos/        Comprobantes, fotos y documentos originales.",
          "datos.json       Los datos completos, para restaurar o migrar a otro sistema.",
          "",
        ].join("\r\n"),
      );
      // Se entrega en streaming: una copia con muchas fotos puede pesar más que el límite de respuesta de Vercel.
      const flujo = Readable.toWeb(
        zip.generateNodeStream({ streamFiles: true, compression: "DEFLATE" }) as Readable,
      ) as ReadableStream<Uint8Array>;
      return new NextResponse(flujo, {
        headers: {
          "Content-Type": TIPOS_MIME.zip,
          "Content-Disposition": `attachment; filename="${nombreArchivo("copia-completa", "zip")}"`,
          "Cache-Control": "private, no-store",
        },
      });
    }
  }
  return NextResponse.json({ error: "Informe desconocido" }, { status: 404 });
}
