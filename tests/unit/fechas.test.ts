import { describe, expect, it } from "vitest";
import {
  aInstante, enZona, sumarDias, sumarMeses, diasEntre, diaSemana, inicioSemana, finMes, esFecha,
  fechaCorta, fechaLarga, fechaRelativa, hoy, saludo,
} from "@/lib/fechas";

describe("fechas en horario de Córdoba (UTC-3)", () => {
  it("convierte fecha y hora local a UTC", () => {
    expect(aInstante("2026-11-11", "10:00").toISOString()).toBe("2026-11-11T13:00:00.000Z");
    expect(aInstante("2026-11-11").toISOString()).toBe("2026-11-11T03:00:00.000Z");
  });
  it("una reunión a las 22:00 sigue siendo del mismo día local", () => {
    const d = aInstante("2026-11-11", "22:30");
    expect(d.toISOString()).toBe("2026-11-12T01:30:00.000Z");
    expect(enZona(d)).toEqual({ fecha: "2026-11-11", hora: "22:30" });
  });
  it("'hoy' cambia a medianoche de Argentina, no de UTC", () => {
    expect(hoy(new Date("2026-11-12T02:59:00Z"))).toBe("2026-11-11");
    expect(hoy(new Date("2026-11-12T03:00:00Z"))).toBe("2026-11-12");
  });
  it("suma días y meses sin desbordar", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-11-15", 2)).toBe("2027-01-15");
    expect(sumarMeses("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("calcula semanas con lunes como primer día", () => {
    expect(diaSemana("2026-11-11")).toBe(2); // miércoles
    expect(inicioSemana("2026-11-11")).toBe("2026-11-09");
    expect(inicioSemana("2026-11-15")).toBe("2026-11-09"); // domingo
    expect(finMes("2026-02-10")).toBe("2026-02-28");
    expect(diasEntre("2026-11-11", "2026-11-18")).toBe(7);
  });
  it("valida fechas reales", () => {
    expect(esFecha("2026-02-29")).toBe(false);
    expect(esFecha("2028-02-29")).toBe(true);
    expect(esFecha("11/11/2026")).toBe(false);
    expect(esFecha(null)).toBe(false);
  });
  it("escribe fechas en castellano", () => {
    expect(fechaCorta("2026-11-11")).toBe("mié 11 nov");
    expect(fechaLarga("2026-11-11")).toBe("miércoles 11 de noviembre");
    expect(fechaRelativa("2026-11-11", "2026-11-11")).toBe("Hoy");
    expect(fechaRelativa("2026-11-12", "2026-11-11")).toBe("Mañana");
    expect(fechaRelativa("2026-11-08", "2026-11-11")).toBe("Hace 3 días");
    expect(fechaRelativa("2026-11-14", "2026-11-11")).toBe("En 3 días");
  });
  it("saluda según la hora local", () => {
    expect(saludo(new Date("2026-11-11T12:00:00Z"))).toBe("Buenos días"); // 09:00
    expect(saludo(new Date("2026-11-11T18:00:00Z"))).toBe("Buenas tardes"); // 15:00
    expect(saludo(new Date("2026-11-12T01:00:00Z"))).toBe("Buenas noches"); // 22:00
  });
});
