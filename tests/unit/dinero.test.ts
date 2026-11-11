import { describe, expect, it } from "vitest";
import { leerImporte, plata, sumarPorMoneda, textoTotales, aCentavos } from "@/lib/dinero";

describe("importes", () => {
  it("lee importes escritos a la argentina", () => {
    expect(leerImporte("85.000")).toBe(85000);
    expect(leerImporte("85.000,50")).toBe(85000.5);
    expect(leerImporte("$ 1.250.000")).toBe(1250000);
    expect(leerImporte("1250,5")).toBe(1250.5);
    expect(leerImporte("1250.5")).toBe(1250.5);
    expect(leerImporte("85000")).toBe(85000);
    expect(leerImporte("85 mil")).toBe(85000);
    expect(leerImporte("1,5 millones")).toBe(1500000);
    expect(leerImporte("US$ 300")).toBe(300);
  });
  it("rechaza lo que no es un número", () => {
    expect(leerImporte("abc")).toBeNull();
    expect(leerImporte("")).toBeNull();
    expect(leerImporte("12abc")).toBeNull();
    expect(leerImporte("-50")).toBeNull();
  });
  it("muestra pesos y dólares distinto", () => {
    const sp = (s: string) => s.replace(/\u00a0/g, " ");
    expect(plata("85000.00", "ARS")).toBe("$\u00a085.000");
    expect(sp(plata("1250.50", "USD"))).toBe("US$ 1.250,5");
    expect(sp(plata(-500, "ARS"))).toBe("-$ 500");
  });
  it("suma sin errores de redondeo y nunca mezcla monedas", () => {
    const t = sumarPorMoneda([
      { importe: "0.10", moneda: "ARS" },
      { importe: "0.20", moneda: "ARS" },
      { importe: "100", moneda: "USD" },
    ]);
    expect(t).toEqual({ ARS: 30, USD: 10000 });
    expect(textoTotales(t).replace(/\u00a0/g, " ")).toBe("$ 0,3 + US$ 100");
    expect(textoTotales({})).toBe("$ 0");
    expect(aCentavos("19.99")).toBe(1999);
  });
});
