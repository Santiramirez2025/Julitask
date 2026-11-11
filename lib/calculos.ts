// Reglas de negocio puras (sin base de datos), para poder probarlas solas.
import { aCentavos, type Totales, type Moneda } from "./dinero";
import { diasEntre, sumarMeses } from "./fechas";
import { MESES_REPETICION } from "./entidades";

export type EstadoPago = "pagado" | "vencido" | "por-pagar";

export function estadoPago(p: { vence: string; pagadoEl: string | null }, hoy: string): EstadoPago {
  if (p.pagadoEl) return "pagado";
  return p.vence < hoy ? "vencido" : "por-pagar";
}

/** Próximo vencimiento de una serie, sin correrse del día original (31 → 28/02 → 31/03). */
export function proximoVencimiento(primero: string, ultimo: string, repite: string) {
  const paso = MESES_REPETICION[repite];
  if (!paso) return null;
  const [a1, m1] = primero.split("-").map(Number);
  const [a2, m2] = ultimo.split("-").map(Number);
  const transcurridos = (a2 - a1) * 12 + (m2 - m1);
  return sumarMeses(primero, transcurridos + paso);
}

export type GastoCalc = {
  importe: string;
  moneda: string;
  categoria: string;
  fecha: string;
  pagado: boolean;
  tipoCambio: string | null;
};

/** Importe del gasto expresado en la moneda de la obra, o null si falta el tipo de cambio. */
export function enMonedaDeObra(g: GastoCalc, monedaObra: string): number | null {
  const c = aCentavos(g.importe);
  if (g.moneda === monedaObra) return c;
  const tc = Number(g.tipoCambio);
  if (!g.tipoCambio || !(tc > 0)) return null;
  // El tipo de cambio siempre es "pesos por dólar".
  return Math.round(monedaObra === "ARS" ? c * tc : c / tc);
}

export function calcularObra(obra: { presupuesto: string; moneda: string }, gastos: GastoCalc[]) {
  const presupuesto = aCentavos(obra.presupuesto);
  let pagado = 0;
  let comprometido = 0;
  const sinConvertir: Totales = {};
  const porCategoria = new Map<string, number>();
  const porMes = new Map<string, number>();

  for (const g of gastos) {
    const c = enMonedaDeObra(g, obra.moneda);
    if (c === null) {
      const m = g.moneda as Moneda;
      sinConvertir[m] = (sinConvertir[m] ?? 0) + aCentavos(g.importe);
      continue;
    }
    if (g.pagado) pagado += c;
    else comprometido += c;
    porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + c);
    const mes = g.fecha.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + c);
  }

  const usado = pagado + comprometido;
  return {
    presupuesto,
    pagado,
    comprometido,
    usado,
    disponible: presupuesto - usado,
    excedida: presupuesto > 0 && usado > presupuesto,
    porcentaje: presupuesto > 0 ? Math.round((usado / presupuesto) * 100) : 0,
    sinConvertir,
    haySinConvertir: Object.values(sinConvertir).some((v) => v),
    porCategoria: [...porCategoria.entries()].sort((a, b) => b[1] - a[1]),
    porMes: [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])),
  };
}

export type Intervalo = { id: string; inicio: Date; duracionMin: number; titulo: string };

/** Reuniones que se pisan con la que se quiere guardar. */
export function conflictos(nueva: { id?: string; inicio: Date; duracionMin: number }, otras: Intervalo[]) {
  const a0 = nueva.inicio.getTime();
  const a1 = a0 + nueva.duracionMin * 60_000;
  return otras.filter((o) => {
    if (o.id === nueva.id) return false;
    const b0 = o.inicio.getTime();
    const b1 = b0 + o.duracionMin * 60_000;
    return a0 < b1 && b0 < a1;
  });
}

type Movimiento = { id: string; importe: string; moneda: string; fecha: string; texto: string };

const normalizar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Pares con mismo importe, moneda y texto, a 3 días o menos: posibles cargas repetidas. */
export function posiblesDuplicados<T extends Movimiento>(filas: T[]): [T, T][] {
  const grupos = new Map<string, T[]>();
  for (const f of filas) {
    const k = `${f.moneda}|${aCentavos(f.importe)}|${normalizar(f.texto)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  const pares: [T, T][] = [];
  for (const g of grupos.values()) {
    g.sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (let i = 1; i < g.length; i++) {
      if (Math.abs(diasEntre(g[i - 1].fecha, g[i].fecha)) <= 3) pares.push([g[i - 1], g[i]]);
    }
  }
  return pares;
}

export { normalizar };
