export const MONEDAS = ["ARS", "USD"] as const;
export type Moneda = (typeof MONEDAS)[number];

const numero = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Texto o número a centavos enteros, para sumar sin errores de redondeo. */
export function aCentavos(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return 0;
  return Math.round(Number(v) * 100);
}

export function simbolo(moneda: string) {
  return moneda === "USD" ? "US$" : "$";
}

/** "$ 85.000" · "US$ 1.250,50" */
export function plata(v: string | number | null | undefined, moneda: string = "ARS") {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  const signo = n < 0 ? "-" : "";
  // Espacio de no separación: el símbolo nunca queda solo al final de un renglón.
  return `${signo}${simbolo(moneda)}\u00a0${numero.format(Math.abs(n))}`;
}

export function plataCentavos(centavos: number, moneda: string = "ARS") {
  return plata(centavos / 100, moneda);
}

export type Totales = Partial<Record<Moneda, number>>;

/** Suma por moneda. Nunca mezcla pesos con dólares. */
export function sumarPorMoneda(
  filas: { importe: string | number | null; moneda: string }[],
): Totales {
  const t: Totales = {};
  for (const f of filas) {
    const m = (f.moneda === "USD" ? "USD" : "ARS") as Moneda;
    t[m] = (t[m] ?? 0) + aCentavos(f.importe);
  }
  return t;
}

/** "$ 120.000 + US$ 300" — o "$ 0" si no hay nada. */
export function textoTotales(t: Totales) {
  const partes = MONEDAS.filter((m) => t[m]).map((m) => plataCentavos(t[m]!, m));
  return partes.length ? partes.join(" + ") : "$ 0";
}

/**
 * Interpreta un importe escrito a la argentina: "85.000", "85.000,50", "1250.5", "$ 85 mil".
 * Devuelve null si no es un número válido.
 */
export function leerImporte(texto: string): number | null {
  let s = texto.toLowerCase().replace(/us\$|u\$s|usd|ars|\$|\s/g, "");
  let factor = 1;
  if (/(millones|millon|millón|palos|palo|m)$/.test(s)) {
    factor = 1_000_000;
    s = s.replace(/(millones|millon|millón|palos|palo|m)$/, "");
  } else if (/(mil|k|lucas|luca)$/.test(s)) {
    factor = 1000;
    s = s.replace(/(mil|k|lucas|luca)$/, "");
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const comas = (s.match(/,/g) || []).length;
  const puntos = (s.match(/\./g) || []).length;
  if (comas === 1 && /,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (comas > 0) {
    s = s.replace(/,/g, "");
    if (puntos > 1) return null;
  } else if (puntos > 1 || /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s) * factor;
  if (!isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
