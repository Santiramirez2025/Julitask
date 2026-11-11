import "server-only";
import writeExcelFile from "write-excel-file/node";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Tabla, Celda } from "./tablas";
import { fechaNumerica, hoy } from "../fechas";

const numeroAR = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function comoTexto(c: Celda, tipo?: string) {
  if (c === null || c === undefined) return "";
  if (tipo === "fecha" && typeof c === "string") return fechaNumerica(c);
  if (typeof c === "number") return numeroAR.format(c);
  return c;
}

/** CSV con punto y coma y BOM: abre bien con doble clic en Excel en español. */
export function aCSV(t: Tabla) {
  const celda = (s: string) => {
    // Evita que una celda que empieza con = + - @ se interprete como fórmula.
    const seguro = /^[=+\-@\t\r]/.test(s) && isNaN(Number(s.replace(",", "."))) ? `'${s}` : s;
    return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  const lineas = [
    t.columnas.map((c) => celda(c.titulo)).join(";"),
    ...t.filas.map((f) =>
      f
        .map((v, i) =>
          celda(
            typeof v === "number" ? String(v).replace(".", ",") : comoTexto(v, t.columnas[i].tipo),
          ),
        )
        .join(";"),
    ),
  ];
  return "﻿" + lineas.join("\r\n") + "\r\n";
}

export async function aXLSX(tablas: Tabla[]): Promise<Buffer> {
  const hojas = tablas.map((t) => ({
    sheet: t.nombre.slice(0, 31),
    stickyRowsCount: 1,
    columns: t.columnas.map((c) => ({ width: c.ancho + 2 })),
    data: [
      t.columnas.map((c) => ({
        value: c.titulo,
        fontWeight: "bold" as const,
        backgroundColor: "#14274A",
        color: "#FFFFFF",
      })),
      ...t.filas.map((f) =>
        f.map((v, i) => {
          const col = t.columnas[i];
          if (v === null || v === "") return null;
          if (col.tipo === "fecha" && typeof v === "string") {
            const [a, m, d] = v.split("-").map(Number);
            return { value: new Date(Date.UTC(a, m - 1, d)), type: Date, format: "dd/mm/yyyy" };
          }
          if (typeof v === "number") return { value: v, type: Number, format: "#,##0.##" };
          return { value: String(v), type: String };
        }),
      ),
    ],
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (writeExcelFile as any)(hojas).toBuffer()) as Buffer;
}

// ---------- PDF ----------

const MARINO = rgb(0.078, 0.153, 0.29);
const GRAFITO = rgb(0.17, 0.18, 0.21);
const GRIS = rgb(0.36, 0.39, 0.44);
const LINEA = rgb(0.9, 0.88, 0.85);

/** Deja solo los caracteres que la fuente puede dibujar (sin emojis, por ejemplo). */
function crearLimpiador(fuente: PDFFont) {
  const admitidos = new Set(fuente.getCharacterSet());
  return (s: string) =>
    [...s.replace(/[\r\n\t\u00a0]+/g, " ")].filter((ch) => admitidos.has(ch.codePointAt(0)!)).join("");
}

function recortar(s: string, fuente: PDFFont, tam: number, ancho: number) {
  if (fuente.widthOfTextAtSize(s, tam) <= ancho) return s;
  let r = s;
  while (r.length > 1 && fuente.widthOfTextAtSize(r + "…", tam) > ancho) r = r.slice(0, -1);
  return r.trimEnd() + "…";
}

function partir(s: string, fuente: PDFFont, tam: number, ancho: number) {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of s.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (fuente.widthOfTextAtSize(prueba, tam) > ancho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function aPDF(titulo: string, subtitulo: string, tablas: Tabla[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(titulo);
  pdf.setCreator("Julián OS");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const limpiar = crearLimpiador(normal);

  const ANCHO = 841.89; // A4 apaisado
  const ALTO = 595.28;
  const M = 36;
  const util = ANCHO - M * 2;
  let pagina!: PDFPage;
  let y = 0;

  const nuevaPagina = () => {
    pagina = pdf.addPage([ANCHO, ALTO]);
    y = ALTO - M;
  };
  nuevaPagina();
  pagina.drawText(limpiar(titulo), { x: M, y: y - 18, size: 20, font: negrita, color: MARINO });
  pagina.drawText(limpiar(subtitulo), { x: M, y: y - 36, size: 10, font: normal, color: GRIS });
  y -= 58;

  for (const t of tablas) {
    // Máximo 9 columnas por tabla en PDF: las últimas (notas) quedan para el Excel.
    const cols = t.columnas.slice(0, 9);
    const total = cols.reduce((s, c) => s + c.ancho, 0);
    const anchos = cols.map((c) => (c.ancho / total) * util);
    const TAM = 8.5;
    const FILA = 17;

    const encabezado = () => {
      pagina.drawRectangle({ x: M, y: y - FILA + 4, width: util, height: FILA, color: MARINO });
      let x = M;
      cols.forEach((c, i) => {
        pagina.drawText(recortar(limpiar(c.titulo), negrita, TAM, anchos[i] - 8), {
          x: x + 4, y: y - 8, size: TAM, font: negrita, color: rgb(1, 1, 1),
        });
        x += anchos[i];
      });
      y -= FILA;
    };

    if (y < M + 90) nuevaPagina();
    if (tablas.length > 1) {
      pagina.drawText(limpiar(t.titulo), { x: M, y: y - 10, size: 12, font: negrita, color: GRAFITO });
      y -= 22;
    }
    encabezado();

    if (!t.filas.length) {
      pagina.drawText("Sin datos.", { x: M + 4, y: y - 9, size: TAM, font: normal, color: GRIS });
      y -= FILA;
    }
    for (const fila of t.filas) {
      if (y < M + 24) {
        nuevaPagina();
        encabezado();
      }
      let x = M;
      cols.forEach((c, i) => {
        const texto = recortar(limpiar(comoTexto(fila[i], c.tipo)), normal, TAM, anchos[i] - 8);
        const w = normal.widthOfTextAtSize(texto, TAM);
        pagina.drawText(texto, {
          x: c.tipo === "numero" ? x + anchos[i] - 4 - w : x + 4,
          y: y - 9, size: TAM, font: normal, color: GRAFITO,
        });
        x += anchos[i];
      });
      pagina.drawLine({ start: { x: M, y: y - 13 }, end: { x: M + util, y: y - 13 }, thickness: 0.5, color: LINEA });
      y -= FILA;
    }
    for (const linea of t.pie ?? []) {
      if (y < M + 24) nuevaPagina();
      pagina.drawText(limpiar(linea), { x: M + 4, y: y - 12, size: 10, font: negrita, color: GRAFITO });
      y -= 16;
    }
    y -= 18;
  }

  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    p.drawText(limpiar(`Julián OS · generado el ${fechaNumerica(hoy())} · página ${i + 1} de ${paginas.length}`), {
      x: M, y: 18, size: 8, font: normal, color: GRIS,
    });
  });
  return Buffer.from(await pdf.save());
}

export type DatosFicha = {
  nombre: string;
  tipo: string;
  estado: string;
  direccion: string | null;
  precio: string | null;
  superficie: string | null;
  observaciones: string | null;
  contacto: string;
  foto?: { datos: Buffer; mime: string } | null;
};

/** Ficha de una página para mandarle a un interesado. No incluye datos del propietario. */
export async function fichaPDF(d: DatosFicha): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(d.nombre);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const limpiar = crearLimpiador(normal);
  const ANCHO = 595.28;
  const ALTO = 841.89;
  const M = 44;
  const util = ANCHO - M * 2;
  const pagina = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - M;

  pagina.drawText(limpiar(`${d.tipo} · ${d.estado}`), { x: M, y: y - 10, size: 11, font: normal, color: GRIS });
  y -= 22;
  for (const linea of partir(limpiar(d.nombre), negrita, 26, util).slice(0, 2)) {
    pagina.drawText(linea, { x: M, y: y - 24, size: 26, font: negrita, color: MARINO });
    y -= 32;
  }
  if (d.direccion) {
    pagina.drawText(recortar(limpiar(d.direccion), normal, 13, util), { x: M, y: y - 14, size: 13, font: normal, color: GRAFITO });
    y -= 24;
  }
  y -= 8;

  if (d.foto) {
    try {
      const img = d.foto.mime === "image/png" ? await pdf.embedPng(d.foto.datos) : await pdf.embedJpg(d.foto.datos);
      const escala = Math.min(util / img.width, 300 / img.height);
      const w = img.width * escala;
      const h = img.height * escala;
      pagina.drawImage(img, { x: M, y: y - h, width: w, height: h });
      y -= h + 22;
    } catch {
      // Formato de imagen no compatible con PDF: la ficha sale sin foto.
    }
  }

  const dato = (etiqueta: string, valor: string) => {
    pagina.drawText(limpiar(etiqueta), { x: M, y: y - 10, size: 10, font: normal, color: GRIS });
    pagina.drawText(limpiar(valor), { x: M, y: y - 30, size: 18, font: negrita, color: GRAFITO });
    y -= 48;
  };
  if (d.precio) dato("Precio", d.precio);
  if (d.superficie) dato("Superficie", d.superficie);

  if (d.observaciones) {
    y -= 4;
    for (const linea of partir(limpiar(d.observaciones), normal, 11.5, util).slice(0, 14)) {
      if (y < 100) break;
      pagina.drawText(linea, { x: M, y: y - 12, size: 11.5, font: normal, color: GRAFITO });
      y -= 17;
    }
  }

  pagina.drawLine({ start: { x: M, y: 70 }, end: { x: M + util, y: 70 }, thickness: 0.7, color: LINEA });
  pagina.drawText(limpiar(d.contacto), { x: M, y: 48, size: 11, font: negrita, color: MARINO });
  return Buffer.from(await pdf.save());
}

export function nombreArchivo(base: string, extension: string) {
  const limpio = base
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `julian-os_${limpio}_${hoy()}.${extension}`;
}
