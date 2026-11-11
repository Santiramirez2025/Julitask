import { describe, expect, it } from "vitest";
import { calcularObra, conflictos, estadoPago, posiblesDuplicados, proximoVencimiento } from "@/lib/calculos";
import { validar, numeroWhatsApp } from "@/lib/entidades";
import { aInstante } from "@/lib/fechas";

const g = (o: Partial<Parameters<typeof calcularObra>[1][number]>) => ({
  importe: "0", moneda: "ARS", categoria: "Materiales", fecha: "2026-11-01", pagado: true, tipoCambio: null, ...o,
});

describe("pagos", () => {
  it("estado según fecha y pago", () => {
    expect(estadoPago({ vence: "2026-11-10", pagadoEl: null }, "2026-11-11")).toBe("vencido");
    expect(estadoPago({ vence: "2026-11-11", pagadoEl: null }, "2026-11-11")).toBe("por-pagar");
    expect(estadoPago({ vence: "2026-11-01", pagadoEl: "2026-11-05" }, "2026-11-11")).toBe("pagado");
  });
  it("los pagos que se repiten conservan el día original", () => {
    expect(proximoVencimiento("2026-01-31", "2026-01-31", "mensual")).toBe("2026-02-28");
    expect(proximoVencimiento("2026-01-31", "2026-02-28", "mensual")).toBe("2026-03-31");
    expect(proximoVencimiento("2026-11-10", "2026-11-10", "bimestral")).toBe("2027-01-10");
    expect(proximoVencimiento("2026-11-10", "2026-11-10", "anual")).toBe("2027-11-10");
    expect(proximoVencimiento("2026-11-10", "2026-11-10", "no")).toBeNull();
  });
});

describe("obras", () => {
  it("separa pagado, comprometido y disponible", () => {
    const c = calcularObra({ presupuesto: "1000000", moneda: "ARS" }, [
      g({ importe: "300000" }),
      g({ importe: "200000", pagado: false, categoria: "Mano de obra" }),
    ]);
    expect(c.pagado).toBe(30000000);
    expect(c.comprometido).toBe(20000000);
    expect(c.disponible).toBe(50000000);
    expect(c.porcentaje).toBe(50);
    expect(c.excedida).toBe(false);
  });
  it("avisa cuando se pasa del presupuesto", () => {
    const c = calcularObra({ presupuesto: "100", moneda: "ARS" }, [g({ importe: "150" })]);
    expect(c.excedida).toBe(true);
    expect(c.disponible).toBe(-5000);
  });
  it("no mezcla dólares sin tipo de cambio explícito", () => {
    const c = calcularObra({ presupuesto: "1000000", moneda: "ARS" }, [
      g({ importe: "100000" }),
      g({ importe: "500", moneda: "USD" }),
    ]);
    expect(c.usado).toBe(10000000);
    expect(c.sinConvertir).toEqual({ USD: 50000 });
    expect(c.haySinConvertir).toBe(true);
  });
  it("convierte cuando hay tipo de cambio cargado, en los dos sentidos", () => {
    const enPesos = calcularObra({ presupuesto: "1000000", moneda: "ARS" }, [g({ importe: "100", moneda: "USD", tipoCambio: "1250.0000" })]);
    expect(enPesos.usado).toBe(12500000);
    expect(enPesos.haySinConvertir).toBe(false);
    const enDolares = calcularObra({ presupuesto: "10000", moneda: "USD" }, [g({ importe: "125000", moneda: "ARS", tipoCambio: "1250" })]);
    expect(enDolares.usado).toBe(10000);
  });
});

describe("agenda", () => {
  const r = (id: string, hora: string, duracionMin = 60) => ({ id, inicio: aInstante("2026-11-12", hora), duracionMin, titulo: id });
  it("detecta reuniones que se pisan", () => {
    const otras = [r("a", "10:00"), r("b", "12:00")];
    expect(conflictos({ inicio: aInstante("2026-11-12", "10:30"), duracionMin: 60 }, otras).map((x) => x.id)).toEqual(["a"]);
    expect(conflictos({ inicio: aInstante("2026-11-12", "11:00"), duracionMin: 60 }, otras)).toEqual([]);
    expect(conflictos({ inicio: aInstante("2026-11-12", "09:00"), duracionMin: 240 }, otras).length).toBe(2);
  });
  it("una reunión no choca consigo misma al editarla", () => {
    expect(conflictos({ id: "a", inicio: aInstante("2026-11-12", "10:00"), duracionMin: 60 }, [r("a", "10:00")])).toEqual([]);
  });
});

describe("duplicados", () => {
  it("marca mismo importe y concepto a pocos días", () => {
    const pares = posiblesDuplicados([
      { id: "1", importe: "85000.00", moneda: "ARS", fecha: "2026-11-10", texto: "Cemento" },
      { id: "2", importe: "85000", moneda: "ARS", fecha: "2026-11-11", texto: "cemento " },
      { id: "3", importe: "85000", moneda: "ARS", fecha: "2026-12-11", texto: "Cemento" },
      { id: "4", importe: "85000", moneda: "USD", fecha: "2026-11-11", texto: "Cemento" },
    ]);
    expect(pares.map(([a, b]) => [a.id, b.id])).toEqual([["1", "2"]]);
  });
});

describe("validación de formularios en el servidor", () => {
  it("acepta un gasto bien cargado y normaliza el importe", () => {
    const v = validar("pago", { concepto: " Luz ", importe: "45.300,50", moneda: "ARS", vence: "2026-11-20", categoria: "Servicios", repite: "mensual" });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.valores.concepto).toBe("Luz");
      expect(v.valores.importe).toBe("45300.50");
    }
  });
  it("rechaza datos faltantes, importes inválidos y opciones inventadas", () => {
    const v = validar("pago", { concepto: "", importe: "abc", moneda: "EUR", vence: "2026-02-30", categoria: "Inventada" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores).sort()).toEqual(["categoria", "concepto", "importe", "moneda", "vence"]);
  });
  it("exige fecha cuando se carga un tipo de cambio", () => {
    const base = { obraId: "3f2b8c1e-1111-4222-8333-444455556666", concepto: "Hierro", importe: "500", moneda: "USD", categoria: "Materiales", pagado: "si", fecha: "2026-11-11" };
    const sinFecha = validar("gastoObra", { ...base, tipoCambio: "1250" });
    expect(sinFecha.ok).toBe(false);
    expect(validar("gastoObra", { ...base, tipoCambio: "1250", tipoCambioFecha: "2026-11-11" }).ok).toBe(true);
  });
  it("no acepta identificadores que no sean UUID", () => {
    const v = validar("gastoObra", { obraId: "1; drop table", concepto: "x", importe: "1", fecha: "2026-11-11" });
    expect(v.ok).toBe(false);
  });
  it("arma el número de WhatsApp argentino", () => {
    expect(numeroWhatsApp("3534222575")).toBe("5493534222575");
    expect(numeroWhatsApp("0353 422-2575")).toBe("5493534222575");
    expect(numeroWhatsApp("+54 9 353 422 2575")).toBe("5493534222575");
    expect(numeroWhatsApp("")).toBeNull();
    expect(numeroWhatsApp("123")).toBeNull();
  });
});
