import "server-only";
import type { Intento, Consulta } from "./local";
import { ES_FORMA } from "../entidades";
import { esFecha, fechaLarga } from "../fechas";

const URL_API = () =>
  (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "") + "/v1/messages";
const MODELO = () => process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

async function llamar(cuerpo: Record<string, unknown>) {
  const r = await fetch(URL_API(), {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODELO(), max_tokens: 700, ...cuerpo }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!r.ok) throw new Error(`IA respondió ${r.status}`);
  const json = (await r.json()) as { content?: { type: string; input?: Record<string, unknown> }[] };
  const uso = json.content?.find((c) => c.type === "tool_use");
  if (!uso?.input) throw new Error("IA no devolvió datos");
  return uso.input;
}

const CONSULTAS: Consulta[] = [
  "hoy", "gastos_mes", "impuestos", "vencidos", "clientes", "obra", "obras", "contador",
];

const HERRAMIENTA = {
  name: "interpretar",
  description:
    "Clasifica el pedido del usuario. No inventa datos: solo extrae lo que el usuario dijo.",
  input_schema: {
    type: "object",
    properties: {
      tipo: {
        type: "string",
        enum: ["consulta", "crear", "faltan", "desconocido"],
        description:
          "consulta: quiere saber algo. crear: quiere registrar algo. faltan: quiere registrar pero falta un dato imprescindible. desconocido: no se entiende o no es algo que la app haga.",
      },
      consulta: {
        type: "string",
        enum: CONSULTAS,
        description:
          "hoy: agenda y pendientes de hoy. gastos_mes: cuánto gastó este mes. impuestos: impuestos por vencer. vencidos: pagos atrasados o por pagar. clientes: clientes para contactar. obra: una obra puntual. obras: todas las obras. contador: resumen para el contador.",
      },
      dias: { type: "integer", description: "Para consulta=impuestos: cuántos días hacia adelante mirar." },
      forma: {
        type: "string",
        enum: ["reunion", "tarea", "pago", "gastoObra", "cliente"],
        description: "Qué registrar. pago = gasto personal. gastoObra = gasto de una obra.",
      },
      obra: { type: "string", description: "Nombre de la obra mencionada, tal como figura en la lista." },
      cliente: { type: "string", description: "Nombre del cliente mencionado, si coincide con la lista." },
      datos: {
        type: "object",
        description:
          "Campos a registrar, todos como texto. reunion: persona, fecha, hora, lugar. tarea: titulo, fecha, hora. pago: concepto, importe, moneda, vence. gastoObra: concepto, importe, moneda, categoria, fecha. cliente: nombre, telefono, interes. Fechas AAAA-MM-DD, horas HH:MM (24 h), importe solo dígitos con punto decimal, moneda ARS o USD.",
        additionalProperties: { type: "string" },
      },
      pregunta: { type: "string", description: "Para tipo=faltan: la pregunta breve para pedir el dato." },
    },
    required: ["tipo"],
  },
};

export async function interpretarConIA(
  texto: string,
  contexto: { hoy: string; obras: string[]; clientes: string[] },
): Promise<Intento> {
  const d = await llamar({
    system: `Sos el intérprete de pedidos de una app de gestión personal de un asesor patrimonial argentino. Hoy es ${fechaLarga(contexto.hoy)} (${contexto.hoy}). Escribe en español rioplatense.
Obras existentes: ${contexto.obras.join("; ") || "ninguna"}.
Clientes existentes: ${contexto.clientes.slice(0, 200).join("; ") || "ninguno"}.
Reglas: una reunión necesita persona, día y hora; si falta alguno usá tipo=faltan. Un gasto necesita importe. "85 mil" es 85000. Nunca completes datos que el usuario no dijo. Categorías de obra: Materiales, Mano de obra, Transporte, Honorarios, Equipamiento, Imprevistos, Otros.`,
    tools: [HERRAMIENTA],
    tool_choice: { type: "tool", name: "interpretar" },
    messages: [{ role: "user", content: texto.slice(0, 600) }],
  });

  const s = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
  if (d.tipo === "consulta" && CONSULTAS.includes(d.consulta as Consulta)) {
    const dias = Number(d.dias);
    return {
      tipo: "consulta",
      consulta: d.consulta as Consulta,
      obra: s(d.obra) || undefined,
      dias: Number.isFinite(dias) && dias >= 0 && dias <= 366 ? dias : undefined,
    };
  }
  if (d.tipo === "crear" && ES_FORMA(d.forma) && d.datos && typeof d.datos === "object") {
    const datos: Record<string, string> = {};
    for (const [k, v] of Object.entries(d.datos as Record<string, unknown>)) {
      if (/^[a-zA-Z]{1,30}$/.test(k)) datos[k] = s(v).slice(0, 300);
    }
    // El importe llega con punto decimal; el formulario lo espera con coma.
    if (datos.importe) datos.importe = datos.importe.replace(/[^\d.]/g, "").replace(".", ",");
    return { tipo: "crear", forma: d.forma, datos, obra: s(d.obra) || undefined, cliente: s(d.cliente) || undefined };
  }
  if (d.tipo === "faltan" && s(d.pregunta)) return { tipo: "faltan", pregunta: s(d.pregunta).slice(0, 200) };
  return { tipo: "desconocido" };
}

export type DatosFactura = {
  proveedor: string;
  concepto: string;
  importe: string;
  moneda: "ARS" | "USD";
  vence: string;
};

/** Lee una foto o PDF de una factura y sugiere los datos. Solo sugiere: nunca registra ni paga. */
export async function leerFacturaConIA(datos: Buffer, mime: string): Promise<DatosFactura> {
  const fuente = { type: "base64", media_type: mime, data: datos.toString("base64") };
  const d = await llamar({
    system:
      "Extraés datos de facturas y boletas argentinas. Si un dato no se lee con claridad, dejalo vacío. No adivines.",
    tools: [
      {
        name: "datos_factura",
        description: "Datos leídos del comprobante.",
        input_schema: {
          type: "object",
          properties: {
            proveedor: { type: "string", description: "Empresa u organismo que emite." },
            concepto: { type: "string", description: "Qué se paga, en 2 a 4 palabras. Ej.: Luz noviembre." },
            importe: { type: "string", description: "Total a pagar, solo dígitos con punto decimal." },
            moneda: { type: "string", enum: ["ARS", "USD"] },
            vence: { type: "string", description: "Fecha de vencimiento AAAA-MM-DD, o vacío." },
          },
          required: ["proveedor", "concepto", "importe", "moneda", "vence"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "datos_factura" },
    messages: [
      {
        role: "user",
        content: [
          mime === "application/pdf" ? { type: "document", source: fuente } : { type: "image", source: fuente },
          { type: "text", text: "Leé este comprobante." },
        ],
      },
    ],
  });
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  const importe = s(d.importe).replace(/[^\d.]/g, "");
  return {
    proveedor: s(d.proveedor),
    concepto: s(d.concepto),
    importe: importe && Number(importe) > 0 ? importe.replace(".", ",") : "",
    moneda: d.moneda === "USD" ? "USD" : "ARS",
    vence: esFecha(s(d.vence)) ? s(d.vence) : "",
  };
}
