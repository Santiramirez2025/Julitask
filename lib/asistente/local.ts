// Intérprete de pedidos en español rioplatense, sin depender de ningún servicio externo.
// Con ANTHROPIC_API_KEY configurada, la IA hace este mismo trabajo (ver ia.ts) y esto queda de respaldo.

import { diaSemana, esFecha, sumarDias } from "../fechas";
import { leerImporte } from "../dinero";
import { CATEGORIAS_OBRA, type Forma } from "../entidades";

export type Consulta =
  | "hoy" | "gastos_mes" | "impuestos" | "vencidos" | "clientes" | "obra" | "obras" | "contador";

export type Intento =
  | { tipo: "consulta"; consulta: Consulta; obra?: string; dias?: number }
  | { tipo: "crear"; forma: Forma; datos: Record<string, string>; obra?: string; cliente?: string }
  | { tipo: "faltan"; pregunta: string }
  | { tipo: "desconocido" };

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpiar = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.;:]+|[\s,.;:¿?¡!]+$/g, "").trim();
const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type Hallazgo<T> = { valor: T; desde: number; hasta: number } | null;

/** Busca una fecha en el texto (ya en minúsculas y sin acentos). */
export function buscarFecha(t: string, hoy: string): Hallazgo<string> {
  let m: RegExpExecArray | null;
  const anioHoy = Number(hoy.slice(0, 4));
  const armar = (d: number, mes: number, anio?: number) => {
    let a = anio ?? anioHoy;
    let f = `${a}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // Sin año y ya pasó: se entiende el año que viene.
    if (!anio && esFecha(f) && f < hoy) {
      a += 1;
      f = `${a}${f.slice(4)}`;
    }
    return esFecha(f) ? f : null;
  };

  if ((m = /\bpasado manana\b/.exec(t))) return { valor: sumarDias(hoy, 2), desde: m.index, hasta: m.index + m[0].length };
  // "mañana" es el día siguiente, salvo en "a la mañana" / "por la mañana".
  const reManana = /\bmanana\b/g;
  while ((m = reManana.exec(t))) {
    const antes = t.slice(Math.max(0, m.index - 7), m.index);
    if (/(a la|por la|de la|esta) $/.test(antes)) continue;
    return { valor: sumarDias(hoy, 1), desde: m.index, hasta: m.index + m[0].length };
  }
  if ((m = /\bhoy\b/.exec(t))) return { valor: hoy, desde: m.index, hasta: m.index + m[0].length };

  if ((m = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(t))) {
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    const f = armar(Number(m[1]), Number(m[2]), anio);
    if (f) return { valor: f, desde: m.index, hasta: m.index + m[0].length };
  }
  if ((m = new RegExp(`\\b(?:el )?(\\d{1,2}) de (${MESES.join("|")})(?: de (\\d{4}))?\\b`).exec(t))) {
    const f = armar(Number(m[1]), MESES.indexOf(m[2]) + 1, m[3] ? Number(m[3]) : undefined);
    if (f) return { valor: f, desde: m.index, hasta: m.index + m[0].length };
  }
  if ((m = new RegExp(`\\b(?:el |este |proximo |el proximo )?(${DIAS.join("|")})(?: que viene| proximo)?\\b`).exec(t))) {
    const objetivo = DIAS.indexOf(m[1]);
    let n = (objetivo - diaSemana(hoy) + 7) % 7;
    if (n === 0) n = 7;
    return { valor: sumarDias(hoy, n), desde: m.index, hasta: m.index + m[0].length };
  }
  if ((m = /\bel (?:dia )?(\d{1,2})\b(?! (?:hs|horas|y|de la|:))/.exec(t))) {
    const d = Number(m[1]);
    const mesHoy = Number(hoy.slice(5, 7));
    let f = armar(d, mesHoy, anioHoy);
    if (f && f < hoy) f = mesHoy === 12 ? armar(d, 1, anioHoy + 1) : armar(d, mesHoy + 1, anioHoy);
    if (f) return { valor: f, desde: m.index, hasta: m.index + m[0].length };
  }
  return null;
}

/** Busca una hora: "a las 10", "10:30", "17 hs", "5 de la tarde", "10 y media", "al mediodía". */
export function buscarHora(t: string): Hallazgo<string> {
  let m: RegExpExecArray | null;
  if ((m = /\b(?:al|a) mediodia\b/.exec(t))) return { valor: "12:00", desde: m.index, hasta: m.index + m[0].length };
  // No toma números pegados a "$" ni con separador de miles: esos son importes.
  const re =
    /(?:\b(?:a las?|tipo|desde las?) )?(?<![\d$.,])(\d{1,2})(?::(\d{2}))?(?![.,]?\d)(?: ?(hs|horas|h)\b)?(?: y (media|cuarto))?(?: de la (manana|tarde|noche)| (am|pm)\b)?/g;
  while ((m = re.exec(t))) {
    const tieneMarca = /^(a las?|tipo|desde las?)/.test(m[0].trim()) || m[2] || m[3] || m[4] || m[5] || m[6];
    if (!tieneMarca) continue;
    let h = Number(m[1]);
    let min = m[2] ? Number(m[2]) : m[4] === "media" ? 30 : m[4] === "cuarto" ? 15 : 0;
    const franja = m[5] ?? m[6];
    if ((franja === "tarde" || franja === "noche" || franja === "pm") && h < 12) h += 12;
    if (h > 23 || min > 59) continue;
    if (min < 0) min = 0;
    const texto = m[0];
    const desde = m.index + (texto.length - texto.trimStart().length);
    return {
      valor: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      desde,
      hasta: m.index + texto.trimEnd().length,
    };
  }
  return null;
}

/** Busca un importe: "$85.000", "85 mil", "1,5 millones", "USD 500", "500 dólares". */
export function buscarImporte(t: string): Hallazgo<{ importe: number; moneda: "ARS" | "USD" }> {
  const re =
    /(us\$|u\$s|usd|\$)? ?(\d[\d.,]*)(?: ?(millones|millon|palos|palo|mil|lucas|luca|k)\b)?(?: ?(dolares|dolar|usd|pesos)\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const numero = m[2].replace(/[.,]+$/, "");
    const tieneMarca = m[1] || m[3] || m[4] || /^\d{4,}$/.test(numero) || /^\d{1,3}(\.\d{3})+/.test(numero);
    if (!tieneMarca) continue;
    const n = leerImporte(numero + (m[3] ?? ""));
    if (n === null || n <= 0) continue;
    const dolares = /us\$|u\$s|usd/.test(m[1] ?? "") || /dolar|usd/.test(m[4] ?? "");
    const texto = m[0];
    const desde = m.index + (texto.length - texto.trimStart().length);
    return { valor: { importe: n, moneda: dolares ? "USD" : "ARS" }, desde, hasta: m.index + texto.trimEnd().length };
  }
  return null;
}

/** Quita del texto original los tramos encontrados (por posición). */
function quitar(original: string, ...tramos: Hallazgo<unknown>[]) {
  let s = original;
  for (const h of tramos.filter(Boolean).sort((a, b) => b!.desde - a!.desde)) {
    s = s.slice(0, h!.desde) + " " + s.slice(h!.hasta);
  }
  return s;
}

const RE_OBRA = /\b(?:para|en|a|de)? ?(?:la |el )?obra(?: de| del| en)? (.+)$/;

export function interpretarLocal(texto: string, hoy: string): Intento {
  const original = texto.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!original) return { tipo: "desconocido" };
  // Misma longitud que el original, así las posiciones coinciden.
  const t = sinAcentos(original.toLowerCase());

  const fecha = buscarFecha(t, hoy);
  const sinFecha = fecha ? t.slice(0, fecha.desde) + " ".repeat(fecha.hasta - fecha.desde) + t.slice(fecha.hasta) : t;
  const hora = buscarHora(sinFecha);
  const sinFechaHora = hora
    ? sinFecha.slice(0, hora.desde) + " ".repeat(hora.hasta - hora.desde) + sinFecha.slice(hora.hasta)
    : sinFecha;
  const monto = buscarImporte(sinFechaHora);
  const esPregunta = /^(que|cuanto|cuanta|cuantos|cuantas|cuando|como|cual|mostrame|decime|dame)\b/.test(t) || original.includes("?");

  // --- Reunión ---
  if (/\b(reunion|reunirme|reunir|juntarme|juntada|cita|encuentro|me junto)\b/.test(t) && !esPregunta) {
    const resto = limpiar(quitar(original, fecha, hora));
    const m = /\bcon (.+)$/i.exec(resto);
    let persona = m ? limpiar(m[1]) : "";
    let lugar = "";
    const enLugar = /^(.*?)\s+en (?:el |la |lo de )?(.+)$/i.exec(persona);
    if (enLugar) {
      persona = limpiar(enLugar[1]);
      lugar = mayuscula(limpiar(enLugar[2]));
    }
    if (!persona) return { tipo: "faltan", pregunta: "¿Con quién es la reunión?" };
    if (!fecha) return { tipo: "faltan", pregunta: `¿Qué día es la reunión con ${mayuscula(persona)}?` };
    if (!hora) return { tipo: "faltan", pregunta: `¿A qué hora es la reunión con ${mayuscula(persona)}?` };
    return {
      tipo: "crear",
      forma: "reunion",
      cliente: persona,
      datos: { persona: mayuscula(persona), fecha: fecha.valor, hora: hora.valor, lugar, duracionMin: "60" },
    };
  }

  // --- Gastos ---
  const verboCarga = /\b(registra|registrar|anota|anotar|carga|cargar|agrega|agregar|suma|sumar|gaste|pague|pago|compre|gastamos|pagamos)\b/.test(t);
  if (monto && !esPregunta && (verboCarga || /^(us\$|\$|\d)/.test(t))) {
    const importe = String(monto.valor.importe).replace(".", ",");
    const sinMonto = quitar(original, fecha, hora, monto);
    const tSinMonto = sinAcentos(sinMonto.toLowerCase());
    const obra = RE_OBRA.exec(tSinMonto);
    const quitarVerbo = (s: string) => {
      let r = s.trim();
      for (const re of [
        /^(registrar|registra|anotar|anota|cargar|carga|agregar|agrega|sumar|suma|gaste|pague|pago|compre|gastamos|pagamos)(me|le)?\b/,
        /^(un gasto|un pago|gasto|pago)\b/,
        /^(de|en|por|para)\b/,
      ]) {
        const m = re.exec(sinAcentos(r.toLowerCase()));
        if (m) r = r.slice(m[0].length).trim();
      }
      return limpiar(r);
    };

    if (obra) {
      const nombreObra = limpiar(sinMonto.slice(obra.index + obra[0].length - obra[1].length));
      const concepto = quitarVerbo(sinMonto.slice(0, obra.index));
      const cNorm = sinAcentos(concepto.toLowerCase());
      const categoria =
        CATEGORIAS_OBRA.find((c) => cNorm.includes(sinAcentos(c.valor.toLowerCase())))?.valor ??
        (/flete|envio|traslado/.test(cNorm) ? "Transporte"
          : /albanil|electricista|plomero|gasista|pintor|jornal/.test(cNorm) ? "Mano de obra"
          : /arquitect|ingenier|escriban/.test(cNorm) ? "Honorarios"
          : /cemento|arena|ladrillo|hierro|cal|pintura|ceramic|cano|cable|madera/.test(cNorm) ? "Materiales"
          : "Otros");
      return {
        tipo: "crear",
        forma: "gastoObra",
        obra: nombreObra,
        datos: {
          concepto: mayuscula(concepto) || categoria,
          importe,
          moneda: monto.valor.moneda,
          categoria,
          fecha: fecha?.valor ?? hoy,
          pagado: "si",
        },
      };
    }
    const concepto = quitarVerbo(sinMonto);
    if (!concepto) return { tipo: "faltan", pregunta: "¿De qué es ese gasto?" };
    return {
      tipo: "crear",
      forma: "pago",
      datos: {
        concepto: mayuscula(concepto), importe, moneda: monto.valor.moneda,
        vence: fecha?.valor ?? hoy, categoria: "Otros", repite: "no",
      },
    };
  }

  // --- Cliente nuevo ---
  const m = /^(?:agrega|agregar|anota|anotar|carga|cargar|nuevo|crea|crear)?\s*(?:un |el |a |al )?(?:nuevo )?cliente(?: nuevo)?[:,]? (.+)$/i.exec(original);
  if (m && !esPregunta) {
    const tel = /(\+?\d[\d\s-]{6,}\d)/.exec(m[1]);
    const nombre = limpiar(tel ? m[1].replace(tel[1], "") : m[1]).replace(/\b(tel|telefono|teléfono|cel|celular)\.?:?$/i, "").trim();
    if (nombre) {
      return {
        tipo: "crear",
        forma: "cliente",
        datos: { nombre: mayuscula(nombre), telefono: tel ? tel[1].replace(/[\s-]/g, "") : "", estado: "nuevo" },
      };
    }
  }

  // --- Tarea / recordatorio ---
  const mNorm = /^(recordame|recordarme|haceme acordar|acordame|tengo que|tarea|anota que tengo que|anota|anotame|agendame|agenda)\b/.exec(t);
  if (mNorm && !esPregunta) {
    const cuerpo = limpiar(
      quitar(original, fecha, hora)
        .slice(mNorm[0].length)
        .replace(/^[:,]?\s*(que tengo que|que|de)\b/i, ""),
    );
    if (!cuerpo) return { tipo: "faltan", pregunta: "¿Qué querés que anote?" };
    return {
      tipo: "crear",
      forma: "tarea",
      datos: { titulo: mayuscula(cuerpo), fecha: fecha?.valor ?? hoy, hora: hora?.valor ?? "" },
    };
  }
  // --- Consultas ---
  if (/\b(contador|contadora)\b/.test(t)) return { tipo: "consulta", consulta: "contador" };
  if (/\bobras?\b/.test(t)) {
    const o = RE_OBRA.exec(t);
    const nombre = o ? limpiar(original.slice(o.index + o[0].length - o[1].length)) : "";
    return nombre ? { tipo: "consulta", consulta: "obra", obra: nombre } : { tipo: "consulta", consulta: "obras" };
  }
  if (/\b(impuestos?|vencimientos?|vencen?|arca|rentas|monotributo)\b/.test(t)) {
    const dias = /\bhoy\b/.test(t) ? 0 : /esta semana|proximos dias/.test(t) ? 7 : /este mes|mes\b/.test(t) ? 31 : undefined;
    return { tipo: "consulta", consulta: "impuestos", dias };
  }
  if (/\b(vencid[oa]s?|atrasad[oa]s?|debo|adeudo)\b/.test(t)) return { tipo: "consulta", consulta: "vencidos" };
  if (/\bclientes?\b/.test(t) || /\b(seguimientos?|contactar|llamar)\b/.test(t)) return { tipo: "consulta", consulta: "clientes" };
  if (/\b(cuanto|cuanta).*(gast|pagu|llevo|sali)/.test(t) || /\bgast(e|o|os|amos)\b.*\bmes\b/.test(t))
    return { tipo: "consulta", consulta: "gastos_mes" };
  if (/\b(hoy|pendientes?|mi dia|agenda|que tengo|que hay)\b/.test(t)) return { tipo: "consulta", consulta: "hoy" };
  if (/\b(pagos?|pagar|cuentas?)\b/.test(t)) return { tipo: "consulta", consulta: "vencidos" };

  return { tipo: "desconocido" };
}
