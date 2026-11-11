"use server";

import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db, pagos } from "../db";
import { usuarioActual, iaDisponible } from "../auth";
import { datosHoy, opcionesFormularios } from "../consultas";
import { interpretarLocal, type Intento } from "../asistente/local";
import { interpretarConIA } from "../asistente/ia";
import { FORMAS, validar, etiquetaDe, type Forma } from "../entidades";
import { enZona, fechaCorta, fechaLarga, fechaRelativa, hoy as fechaHoy, mesYAnio, sumarDias } from "../fechas";
import { plata, plataCentavos, textoTotales, leerImporte } from "../dinero";
import { normalizar } from "../calculos";

export type RespuestaAsistente = {
  texto: string;
  lineas?: string[];
  enlaces?: { texto: string; href: string }[];
  /** Algo para registrar: se muestra y recién se guarda cuando el usuario confirma. */
  propuesta?: { forma: Forma; datos: Record<string, string>; resumen: string[] };
  /** Falta un dato: la próxima respuesta del usuario completa este mismo pedido. */
  faltan?: boolean;
};

const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;

function buscarPorNombre<T extends { nombre: string }>(lista: T[], nombre: string | undefined) {
  if (!nombre) return null;
  const n = normalizar(nombre);
  if (!n) return null;
  const exacto = lista.filter((x) => normalizar(x.nombre) === n);
  if (exacto.length === 1) return exacto[0];
  const parecidos = lista.filter((x) => {
    const y = normalizar(x.nombre);
    return y.includes(n) || n.includes(y);
  });
  return parecidos.length === 1 ? parecidos[0] : null;
}

export async function preguntar(texto: string): Promise<RespuestaAsistente> {
  const u = await usuarioActual();
  if (!u) return { texto: "Tu sesión venció. Volvé a entrar." };
  const pedido = String(texto ?? "").trim().slice(0, 600);
  if (!pedido) return { texto: "Escribí o dictá lo que necesitás." };

  const hoy = fechaHoy();
  const ops = await opcionesFormularios(u.id);

  let intento: Intento | null = null;
  if (iaDisponible()) {
    try {
      intento = await interpretarConIA(pedido, {
        hoy,
        obras: ops.obras.map((o) => o.nombre),
        clientes: ops.clientes.map((c) => c.nombre),
      });
    } catch (e) {
      console.error("Asistente: la IA no respondió, se usa el intérprete local.", e);
    }
  }
  if (!intento || intento.tipo === "desconocido") {
    const local = interpretarLocal(pedido, hoy);
    if (!intento || local.tipo !== "desconocido") intento = local;
  }

  switch (intento.tipo) {
    case "faltan":
      return { texto: intento.pregunta, faltan: true };

    case "desconocido":
      return {
        texto: "No llegué a entender eso. Podés pedirme cosas como estas:",
        lineas: [
          "¿Qué tengo pendiente hoy?",
          "¿Cuánto gasté este mes?",
          "Agendame reunión con Martín mañana a las 10",
          "Registrá $85.000 de materiales para la obra Centro",
        ],
      };

    case "crear": {
      const datos = { ...intento.datos };
      if (intento.forma === "gastoObra") {
        if (!ops.obras.length)
          return { texto: "Todavía no cargaste ninguna obra. Creala primero desde Obras." , enlaces: [{ texto: "Ir a Obras", href: "/obras" }] };
        const obra = buscarPorNombre(ops.obras, intento.obra) ?? (ops.obras.length === 1 && !intento.obra ? ops.obras[0] : null);
        if (!obra)
          return {
            texto: intento.obra
              ? `No encontré una obra llamada «${intento.obra}». ¿Para cuál es?`
              : "¿Para qué obra es?",
            lineas: ops.obras.map((o) => o.nombre),
            faltan: true,
          };
        datos.obraId = obra.id;
        datos.fecha ||= hoy;
        datos.pagado ||= "si";
        datos.categoria ||= "Otros";
        datos.concepto ||= datos.categoria;
      }
      if (intento.forma === "reunion" || intento.forma === "tarea") {
        const cliente = buscarPorNombre(ops.clientes, intento.cliente);
        if (cliente) datos.clienteId = cliente.id;
        datos.fecha ||= hoy;
      }
      if (intento.forma === "pago") {
        datos.vence ||= hoy;
        datos.categoria ||= "Otros";
        datos.repite ||= "no";
      }
      for (const c of FORMAS[intento.forma].campos) {
        if (datos[c.nombre] == null && c.inicial && c.inicial !== "hoy") datos[c.nombre] = c.inicial;
      }

      const v = validar(intento.forma, datos);
      if (!v.ok) {
        const campo = FORMAS[intento.forma].campos.find((c) => v.errores[c.nombre]);
        return { texto: `Me falta un dato: ${campo?.etiqueta.toLowerCase() ?? "revisá el pedido"}.`, faltan: true };
      }

      const resumen: string[] = [];
      for (const c of FORMAS[intento.forma].campos) {
        const valor = datos[c.nombre];
        if (!valor || c.nombre === "moneda" || c.nombre === "duracionMin" || c.nombre === "repite") continue;
        if (c.tipo === "importe")
          resumen.push(`${c.etiqueta}: ${plata(leerImporte(valor) ?? 0, datos[c.campoMoneda ?? "moneda"] ?? "ARS")}`);
        else if (c.tipo === "fecha") resumen.push(`${c.etiqueta}: ${fechaLarga(valor)}`);
        else if (c.tipo === "hora") resumen.push(`${c.etiqueta}: ${valor}`);
        else if (c.tipo === "obra") resumen.push(`Obra: ${ops.obras.find((o) => o.id === valor)?.nombre}`);
        else if (c.tipo === "cliente") resumen.push(`Cliente: ${ops.clientes.find((o) => o.id === valor)?.nombre}`);
        else if (c.tipo === "si-no") resumen.push(valor === "si" ? "Ya pagado" : "Compromiso pendiente de pago");
        else if (c.tipo === "opciones") resumen.push(`${c.etiqueta}: ${etiquetaDe(c.opciones ?? [], valor)}`);
        else resumen.push(`${c.etiqueta}: ${valor}`);
      }
      return {
        texto: `Voy a registrar esto. ¿Está bien?`,
        propuesta: { forma: intento.forma, datos, resumen },
      };
    }

    case "consulta": {
      const d = await datosHoy(u);
      switch (intento.consulta) {
        case "hoy": {
          const partes = [
            d.reuniones.length && plural(d.reuniones.length, "reunión", "reuniones"),
            d.tareas.length && plural(d.tareas.length, "tarea pendiente", "tareas pendientes"),
            d.vencidos.length && plural(d.vencidos.length, "pago vencido", "pagos vencidos"),
            d.paraContactar.length && plural(d.paraContactar.length, "cliente para contactar", "clientes para contactar"),
          ].filter(Boolean) as string[];
          const enumerar = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}` : partes[0];
          const lineas = [
            ...d.reuniones.map((r) => `${enZona(r.inicio).hora} · ${r.persona ?? r.titulo}${r.lugar ? ` (${r.lugar})` : ""}`),
            ...d.tareas.slice(0, 5).map((t) => `Tarea: ${t.titulo}`),
            ...d.vencidos.slice(0, 4).map((p) => `Vencido: ${p.concepto} ${plata(p.importe, p.moneda)}`),
            ...d.paraContactar.slice(0, 4).map((c) => `Contactar: ${c.nombre}`),
          ];
          return {
            texto: partes.length ? `Hoy tenés ${enumerar}.` : "Hoy no tenés nada pendiente.",
            lineas,
            enlaces: [{ texto: "Ver agenda", href: "/agenda" }],
          };
        }
        case "gastos_mes":
          return {
            texto: `En ${mesYAnio(hoy)} llevás pagado ${textoTotales(d.gastadoMes.personales)} entre gastos personales e impuestos, y ${textoTotales(d.gastadoMes.obras)} en obras.`,
            enlaces: [{ texto: "Ver pagos", href: "/pagos?ver=pagado" }],
          };
        case "impuestos": {
          const dias = intento.dias ?? 30;
          const hasta = sumarDias(hoy, dias);
          const lista = await db
            .select()
            .from(pagos)
            .where(
              and(
                eq(pagos.usuarioId, u.id), eq(pagos.tipo, "impuesto"), isNull(pagos.borradoEl),
                isNull(pagos.pagadoEl), lte(pagos.vence, hasta),
              ),
            )
            .orderBy(asc(pagos.vence));
          const cuando = dias === 0 ? "hoy" : dias === 7 ? "esta semana" : `en los próximos ${dias} días`;
          return {
            texto: lista.length
              ? `${plural(lista.length, "impuesto vence", "impuestos vencen")} ${cuando} o ya ${lista.length === 1 ? "venció" : "vencieron"}:`
              : `No tenés impuestos que venzan ${cuando}.`,
            lineas: lista.slice(0, 8).map(
              (p) => `${p.concepto} · ${plata(p.importe, p.moneda)} · ${p.vence < hoy ? "vencido, " : ""}${fechaRelativa(p.vence, hoy).toLowerCase()}`,
            ),
            enlaces: [{ texto: "Ver impuestos", href: "/impuestos" }],
          };
        }
        case "vencidos": {
          const porPagar = [...d.pagosPersonales, ...d.impuestos].filter((p) => p.vence >= hoy);
          return {
            texto: d.vencidos.length
              ? `Tenés ${plural(d.vencidos.length, "pago vencido", "pagos vencidos")}.`
              : porPagar.length
                ? `No tenés nada vencido. Se vienen ${plural(porPagar.length, "pago", "pagos")}:`
                : "No tenés nada vencido ni pagos próximos.",
            lineas: (d.vencidos.length ? d.vencidos : porPagar)
              .slice(0, 8)
              .map((p) => `${p.concepto} · ${plata(p.importe, p.moneda)} · ${fechaCorta(p.vence)}`),
            enlaces: [{ texto: "Ver pagos", href: "/pagos" }],
          };
        }
        case "clientes":
          return {
            texto: d.paraContactar.length
              ? `Tenés ${plural(d.paraContactar.length, "cliente", "clientes")} para contactar:`
              : "No tenés clientes pendientes de contactar.",
            lineas: d.paraContactar.slice(0, 8).map(
              (c) => `${c.nombre}${c.interes ? ` · ${c.interes}` : ""} · ${fechaRelativa(c.proximoSeguimiento!, hoy).toLowerCase()}`,
            ),
            enlaces: [{ texto: "Ver clientes", href: "/clientes?ver=hoy" }],
          };
        case "obras":
        case "obra": {
          if (!d.obras.length) return { texto: "Todavía no cargaste ninguna obra.", enlaces: [{ texto: "Ir a Obras", href: "/obras" }] };
          const una = intento.consulta === "obra" ? buscarPorNombre(d.obras, intento.obra) : null;
          if (intento.consulta === "obra" && !una)
            return { texto: `No encontré una obra llamada «${intento.obra}». Estas son las que tenés:`, lineas: d.obras.map((o) => o.nombre) };
          if (una) {
            const c = una.calc;
            return {
              texto: `En ${una.nombre} llevás ${plataCentavos(c.usado, una.moneda)} de ${plataCentavos(c.presupuesto, una.moneda)} (${c.porcentaje}%). ${c.disponible >= 0 ? `Quedan ${plataCentavos(c.disponible, una.moneda)}.` : `Está ${plataCentavos(-c.disponible, una.moneda)} por encima del presupuesto.`}`,
              lineas: [
                ...(c.comprometido ? [`Incluye ${plataCentavos(c.comprometido, una.moneda)} todavía sin pagar.`] : []),
                ...(c.haySinConvertir ? [`Aparte, sin convertir: ${textoTotales(c.sinConvertir)}.`] : []),
              ],
              enlaces: [{ texto: "Ver la obra", href: `/obras/${una.id}` }],
            };
          }
          return {
            texto: `Tenés ${plural(d.obras.length, "obra", "obras")}:`,
            lineas: d.obras.map(
              (o) => `${o.nombre} · ${plataCentavos(o.calc.usado, o.moneda)} de ${plataCentavos(o.calc.presupuesto, o.moneda)} (${o.calc.porcentaje}%)`,
            ),
            enlaces: [{ texto: "Ver obras", href: "/obras" }],
          };
        }
        case "contador":
          return {
            texto: "Listo el resumen para tu contador: impuestos y pagos del año, con su estado.",
            enlaces: [
              { texto: "Descargar Excel", href: "/api/exportar/contador?formato=xlsx" },
              { texto: "Descargar PDF", href: "/api/exportar/contador?formato=pdf" },
            ],
          };
      }
    }
  }
  return { texto: "No llegué a entender eso." };
}
