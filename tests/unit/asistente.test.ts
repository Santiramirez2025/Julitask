import { describe, expect, it } from "vitest";
import { interpretarLocal, buscarFecha, buscarHora, buscarImporte } from "@/lib/asistente/local";

const HOY = "2026-11-11"; // miércoles
const n = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

describe("piezas", () => {
  it("fechas habladas", () => {
    expect(buscarFecha(n("mañana a las 10"), HOY)?.valor).toBe("2026-11-12");
    expect(buscarFecha(n("pasado mañana"), HOY)?.valor).toBe("2026-11-13");
    expect(buscarFecha(n("el viernes"), HOY)?.valor).toBe("2026-11-13");
    expect(buscarFecha(n("el miércoles"), HOY)?.valor).toBe("2026-11-18");
    expect(buscarFecha(n("el 20 de noviembre"), HOY)?.valor).toBe("2026-11-20");
    expect(buscarFecha(n("el 5 de enero"), HOY)?.valor).toBe("2027-01-05");
    expect(buscarFecha(n("15/12"), HOY)?.valor).toBe("2026-12-15");
    expect(buscarFecha(n("el 3"), HOY)?.valor).toBe("2026-12-03");
    expect(buscarFecha(n("hoy a la mañana"), HOY)?.valor).toBe(HOY);
    expect(buscarFecha(n("por la mañana"), HOY)).toBeNull();
  });
  it("horas habladas", () => {
    expect(buscarHora("a las 10")?.valor).toBe("10:00");
    expect(buscarHora("a las 10:30")?.valor).toBe("10:30");
    expect(buscarHora("17 hs")?.valor).toBe("17:00");
    expect(buscarHora("a las 5 de la tarde")?.valor).toBe("17:00");
    expect(buscarHora("a las 9 y media")?.valor).toBe("09:30");
    expect(buscarHora("al mediodia")?.valor).toBe("12:00");
    expect(buscarHora("pague $15.000 de luz")).toBeNull();
    expect(buscarHora("comprar 20 bolsas")).toBeNull();
  });
  it("importes hablados", () => {
    expect(buscarImporte("$85.000 de materiales")?.valor).toEqual({ importe: 85000, moneda: "ARS" });
    expect(buscarImporte("85 mil de cemento")?.valor).toEqual({ importe: 85000, moneda: "ARS" });
    expect(buscarImporte("usd 500 de honorarios")?.valor).toEqual({ importe: 500, moneda: "USD" });
    expect(buscarImporte("300 dolares")?.valor).toEqual({ importe: 300, moneda: "USD" });
    expect(buscarImporte("1,5 millones")?.valor).toEqual({ importe: 1500000, moneda: "ARS" });
    expect(buscarImporte("reunion con juan")).toBeNull();
  });
});

describe("pedidos del brief", () => {
  it("Agendame reunión con Martín mañana a las 10", () => {
    expect(interpretarLocal("Agendame reunión con Martín mañana a las 10", HOY)).toEqual({
      tipo: "crear", forma: "reunion", cliente: "Martín",
      datos: { persona: "Martín", fecha: "2026-11-12", hora: "10:00", lugar: "", duracionMin: "60" },
    });
  });
  it("Registrá $85.000 de materiales para la obra Centro.", () => {
    expect(interpretarLocal("Registrá $85.000 de materiales para la obra Centro.", HOY)).toEqual({
      tipo: "crear", forma: "gastoObra", obra: "Centro",
      datos: { concepto: "Materiales", importe: "85000", moneda: "ARS", categoria: "Materiales", fecha: HOY, pagado: "si" },
    });
  });
  it("consultas", () => {
    expect(interpretarLocal("¿Qué tengo pendiente hoy?", HOY)).toEqual({ tipo: "consulta", consulta: "hoy" });
    expect(interpretarLocal("¿Cuánto gasté este mes?", HOY)).toEqual({ tipo: "consulta", consulta: "gastos_mes" });
    expect(interpretarLocal("¿Qué impuestos vencen esta semana?", HOY)).toEqual({ tipo: "consulta", consulta: "impuestos", dias: 7 });
    expect(interpretarLocal("Mostrame los clientes que no contacté.", HOY)).toEqual({ tipo: "consulta", consulta: "clientes" });
    expect(interpretarLocal("¿Cuánto gastamos en la obra de Villa Nueva?", HOY)).toEqual({ tipo: "consulta", consulta: "obra", obra: "Villa Nueva" });
    expect(interpretarLocal("Preparame un resumen para mi contador.", HOY)).toEqual({ tipo: "consulta", consulta: "contador" });
  });
});

describe("otros pedidos", () => {
  it("pide lo que falta en vez de inventarlo", () => {
    expect(interpretarLocal("Agendame reunión con Martín mañana", HOY)).toEqual({ tipo: "faltan", pregunta: "¿A qué hora es la reunión con Martín?" });
    expect(interpretarLocal("Agendame reunión con Martín mañana a las 10", HOY).tipo).toBe("crear");
    expect(interpretarLocal("agendar una reunión", HOY)).toEqual({ tipo: "faltan", pregunta: "¿Con quién es la reunión?" });
  });
  it("reunión con lugar y hora de la tarde", () => {
    const r = interpretarLocal("Reunión con el escribano Pérez en la oficina el viernes a las 5 de la tarde", HOY);
    expect(r).toMatchObject({ tipo: "crear", forma: "reunion", datos: { persona: "El escribano Pérez", lugar: "Oficina", fecha: "2026-11-13", hora: "17:00" } });
  });
  it("gasto personal sin obra", () => {
    expect(interpretarLocal("Pagué 45.300 de luz", HOY)).toMatchObject({ tipo: "crear", forma: "pago", datos: { concepto: "Luz", importe: "45300", moneda: "ARS" } });
  });
  it("gasto de obra en dólares con categoría deducida", () => {
    expect(interpretarLocal("anotá usd 500 del arquitecto en la obra Villa Nueva", HOY)).toMatchObject({
      tipo: "crear", forma: "gastoObra", obra: "Villa Nueva", datos: { importe: "500", moneda: "USD", categoria: "Honorarios" },
    });
  });
  it("tareas", () => {
    expect(interpretarLocal("Recordame llamar al contador el viernes", HOY)).toEqual({
      tipo: "crear", forma: "tarea", datos: { titulo: "Llamar al contador", fecha: "2026-11-13", hora: "" },
    });
    expect(interpretarLocal("tengo que renovar el seguro", HOY)).toMatchObject({ tipo: "crear", forma: "tarea", datos: { titulo: "Renovar el seguro", fecha: HOY } });
  });
  it("cliente nuevo con teléfono", () => {
    expect(interpretarLocal("Nuevo cliente Laura Gómez 3534 112233", HOY)).toEqual({
      tipo: "crear", forma: "cliente", datos: { nombre: "Laura Gómez", telefono: "3534112233", estado: "nuevo" },
    });
  });
  it("no entiende y lo dice", () => {
    expect(interpretarLocal("contame un chiste", HOY)).toEqual({ tipo: "desconocido" });
    expect(interpretarLocal("", HOY)).toEqual({ tipo: "desconocido" });
  });
});
