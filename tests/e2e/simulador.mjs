// Simula las APIs externas (Anthropic y Resend) para probar esas integraciones sin claves reales.
import http from "node:http";

const pedidos = [];
const leer = (req) => new Promise((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });

http
  .createServer(async (req, res) => {
    const json = (codigo, cuerpo) => { res.writeHead(codigo, { "content-type": "application/json" }); res.end(JSON.stringify(cuerpo)); };
    if (req.url === "/__pedidos") return json(200, pedidos);
    if (req.url === "/__limpiar") { pedidos.length = 0; return json(200, {}); }
    const cuerpo = JSON.parse((await leer(req)) || "{}");
    pedidos.push({ url: req.url, clave: req.headers["x-api-key"] ?? req.headers.authorization, cuerpo });

    if (req.url === "/emails") return json(200, { id: "correo-simulado" });

    if (req.url === "/v1/messages") {
      const herramienta = cuerpo.tools?.[0]?.name;
      const ultimo = cuerpo.messages.at(-1).content;
      const texto = typeof ultimo === "string" ? ultimo : "";
      if (texto.includes("falla-ia")) return json(500, { error: "simulada" });
      let input = { tipo: "desconocido" };
      if (herramienta === "datos_factura") {
        input = { proveedor: "EPEC", concepto: "Luz noviembre", importe: "45300.50", moneda: "ARS", vence: "2026-12-10" };
      } else if (texto.includes("dentista")) {
        input = { tipo: "crear", forma: "reunion", datos: { persona: "Dentista", fecha: "2027-03-04", hora: "16:00", lugar: "Consultorio" } };
      }
      return json(200, { id: "msg_simulado", type: "message", role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: herramienta, input }], stop_reason: "tool_use" });
    }
    json(404, {});
  })
  .listen(3199, () => console.log("Simulador en 3199"));
