"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db, pagos, eventos, clientes, inmuebles, obras, gastosObra, visitas, intereses,
  archivos, registro, usuarios, type Prefs,
} from "../db";
import { usuarioActual, prefsCompletas, iniciarSesion } from "../auth";
import {
  FORMAS, ES_FORMA, ESTADOS_CLIENTE, validar, esId, type Forma, type Valor,
} from "../entidades";
import { aInstante, enZona, esFecha, hoy, sumarDias } from "../fechas";
import { conflictos } from "../calculos";
import { asegurarRecurrentes } from "../consultas";

export type Resultado =
  | { ok: true; id: string; mensaje: string }
  | { ok: false; error?: string; errores?: Record<string, string>; conflicto?: string };

const SIN_SESION = { ok: false as const, error: "Tu sesión venció. Volvé a entrar." };
const NO_ENCONTRADO = { ok: false as const, error: "No se encontró. Puede que ya se haya borrado." };

const TABLAS = {
  pago: pagos, impuesto: pagos,
  tarea: eventos, reunion: eventos, recordatorio: eventos,
  cliente: clientes, inmueble: inmuebles, obra: obras, gastoObra: gastosObra, visita: visitas,
} as const;

const NOMBRES: Record<Forma, string> = {
  pago: "gasto", impuesto: "impuesto", tarea: "tarea", reunion: "reunión",
  recordatorio: "recordatorio", cliente: "cliente", inmueble: "inmueble", obra: "obra",
  gastoObra: "gasto de obra", visita: "visita",
};

async function anotar(uid: string, accion: string, entidad: string, entidadId: string | null, resumen: string) {
  await db.insert(registro).values({ usuarioId: uid, accion, entidad, entidadId, resumen: resumen.slice(0, 300) });
}

function refrescar() {
  revalidatePath("/", "layout");
}

async function esMio(tabla: typeof clientes | typeof inmuebles | typeof obras, id: Valor, uid: string) {
  if (!esId(id)) return false;
  const [f] = await db
    .select({ id: tabla.id })
    .from(tabla)
    .where(and(eq(tabla.id, id), eq(tabla.usuarioId, uid), isNull(tabla.borradoEl)))
    .limit(1);
  return Boolean(f);
}

const txt = (v: Valor) => (v === null ? null : String(v));

export async function guardar(
  forma: string,
  crudo: Record<string, string>,
  id?: string | null,
  opciones?: { forzar?: boolean },
): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!ES_FORMA(forma)) return { ok: false, error: "Formulario desconocido." };
  if (id != null && !esId(id)) return NO_ENCONTRADO;

  const v = validar(forma, crudo);
  if (!v.ok) return { ok: false, errores: v.errores };
  const d = v.valores;
  const nuevoId = id ?? crypto.randomUUID();
  let resumen = "";

  // Las relaciones tienen que ser del mismo usuario.
  if (d.clienteId && !(await esMio(clientes, d.clienteId, u.id)))
    return { ok: false, errores: { clienteId: "Ese cliente ya no existe." } };
  if (d.inmuebleId && !(await esMio(inmuebles, d.inmuebleId, u.id)))
    return { ok: false, errores: { inmuebleId: "Ese inmueble ya no existe." } };
  if (d.obraId && !(await esMio(obras, d.obraId, u.id)))
    return { ok: false, errores: { obraId: "Esa obra ya no existe." } };

  let filas = 1;

  switch (forma) {
    case "pago":
    case "impuesto": {
      const repite = txt(d.repite) ?? "no";
      const datos = {
        tipo: forma === "impuesto" ? "impuesto" : "personal",
        concepto: txt(d.concepto)!,
        categoria: txt(d.categoria) ?? (forma === "impuesto" ? "Otras obligaciones" : "Otros"),
        importe: txt(d.importe)!,
        moneda: txt(d.moneda) ?? "ARS",
        vence: txt(d.vence)!,
        medioPago: txt(d.medioPago ?? null),
        proveedor: txt(d.proveedor ?? null),
        periodo: txt(d.periodo ?? null),
        notas: txt(d.notas),
        repite,
      };
      if (id) {
        const r = await db
          .update(pagos)
          .set({
            ...datos,
            // Una serie conserva su identificador aunque se cambie cada cuánto se repite.
            serieId: repite === "no" ? sql`${pagos.serieId}` : sql`coalesce(${pagos.serieId}, ${id}::uuid)`,
          })
          .where(and(eq(pagos.id, id), eq(pagos.usuarioId, u.id)))
          .returning({ id: pagos.id });
        filas = r.length;
      } else {
        await db.insert(pagos).values({
          id: nuevoId, usuarioId: u.id, ...datos, serieId: repite === "no" ? null : nuevoId,
        });
      }
      resumen = datos.concepto;
      break;
    }

    case "tarea":
    case "recordatorio":
    case "reunion": {
      const hora = txt(d.hora ?? null);
      const inicio = aInstante(txt(d.fecha)!, hora ?? "00:00");
      const duracionMin = forma === "reunion" ? Number(d.duracionMin ?? 60) : 30;
      if (forma === "reunion" && !opciones?.forzar) {
        const cerca = await db
          .select({ id: eventos.id, inicio: eventos.inicio, duracionMin: eventos.duracionMin, titulo: eventos.titulo, persona: eventos.persona })
          .from(eventos)
          .where(
            and(
              eq(eventos.usuarioId, u.id), eq(eventos.tipo, "reunion"), isNull(eventos.borradoEl),
              gte(eventos.inicio, new Date(inicio.getTime() - 86_400_000)),
              lt(eventos.inicio, new Date(inicio.getTime() + 86_400_000)),
            ),
          );
        const choque = conflictos({ id: id ?? undefined, inicio, duracionMin }, cerca)[0];
        if (choque) {
          const otro = cerca.find((c) => c.id === choque.id)!;
          return {
            ok: false,
            conflicto: `A esa hora ya tenés ${otro.persona ? `reunión con ${otro.persona}` : otro.titulo || "otra reunión"} (${enZona(otro.inicio).hora}).`,
          };
        }
      }
      const datos = {
        tipo: forma,
        titulo: txt(d.titulo) ?? "",
        inicio,
        sinHora: !hora,
        duracionMin,
        persona: txt(d.persona ?? null),
        lugar: txt(d.lugar ?? null),
        notas: txt(d.notas),
        clienteId: txt(d.clienteId ?? null),
      };
      if (id) {
        const r = await db.update(eventos).set(datos)
          .where(and(eq(eventos.id, id), eq(eventos.usuarioId, u.id))).returning({ id: eventos.id });
        filas = r.length;
      } else {
        await db.insert(eventos).values({ id: nuevoId, usuarioId: u.id, ...datos });
      }
      resumen = datos.persona ? `Reunión con ${datos.persona}` : datos.titulo;
      break;
    }

    case "cliente": {
      const datos = {
        nombre: txt(d.nombre)!,
        telefono: txt(d.telefono),
        whatsapp: txt(d.whatsapp),
        email: txt(d.email),
        interes: txt(d.interes),
        presupuesto: txt(d.presupuesto),
        presupuestoMoneda: txt(d.presupuestoMoneda) ?? "USD",
        estado: txt(d.estado) ?? "nuevo",
        ultimaConversacion: txt(d.ultimaConversacion),
        proximoSeguimiento: txt(d.proximoSeguimiento),
        notas: txt(d.notas),
      };
      if (id) {
        const r = await db.update(clientes).set(datos)
          .where(and(eq(clientes.id, id), eq(clientes.usuarioId, u.id))).returning({ id: clientes.id });
        filas = r.length;
      } else {
        await db.insert(clientes).values({ id: nuevoId, usuarioId: u.id, ...datos });
      }
      resumen = datos.nombre;
      break;
    }

    case "inmueble": {
      const datos = {
        nombre: txt(d.nombre)!,
        direccion: txt(d.direccion),
        tipo: txt(d.tipo) ?? "Casa",
        precio: txt(d.precio),
        moneda: txt(d.moneda) ?? "USD",
        superficie: txt(d.superficie),
        propietario: txt(d.propietario),
        estado: txt(d.estado) ?? "disponible",
        observaciones: txt(d.observaciones),
      };
      if (id) {
        const r = await db.update(inmuebles).set(datos)
          .where(and(eq(inmuebles.id, id), eq(inmuebles.usuarioId, u.id))).returning({ id: inmuebles.id });
        filas = r.length;
      } else {
        await db.insert(inmuebles).values({ id: nuevoId, usuarioId: u.id, ...datos });
      }
      resumen = datos.nombre;
      break;
    }

    case "obra": {
      const datos = {
        nombre: txt(d.nombre)!,
        direccion: txt(d.direccion),
        presupuesto: txt(d.presupuesto)!,
        moneda: txt(d.moneda) ?? "ARS",
        estado: txt(d.estado) ?? "activa",
        notas: txt(d.notas),
      };
      if (id) {
        const r = await db.update(obras).set(datos)
          .where(and(eq(obras.id, id), eq(obras.usuarioId, u.id))).returning({ id: obras.id });
        filas = r.length;
      } else {
        await db.insert(obras).values({ id: nuevoId, usuarioId: u.id, ...datos });
      }
      resumen = datos.nombre;
      break;
    }

    case "gastoObra": {
      const datos = {
        obraId: txt(d.obraId)!,
        fecha: txt(d.fecha)!,
        concepto: txt(d.concepto)!,
        proveedor: txt(d.proveedor),
        importe: txt(d.importe)!,
        moneda: txt(d.moneda) ?? "ARS",
        categoria: txt(d.categoria) ?? "Materiales",
        pagado: d.pagado === true,
        tipoCambio: txt(d.tipoCambio),
        tipoCambioFecha: txt(d.tipoCambioFecha),
      };
      if (id) {
        const r = await db.update(gastosObra).set(datos)
          .where(and(eq(gastosObra.id, id), eq(gastosObra.usuarioId, u.id))).returning({ id: gastosObra.id });
        filas = r.length;
      } else {
        await db.insert(gastosObra).values({ id: nuevoId, usuarioId: u.id, ...datos });
      }
      resumen = datos.concepto;
      break;
    }

    case "visita": {
      const datos = {
        inmuebleId: txt(d.inmuebleId)!,
        clienteId: txt(d.clienteId),
        tipo: txt(d.tipo) ?? "visita",
        fecha: txt(d.fecha)!,
        notas: txt(d.notas),
      };
      if (id) {
        const r = await db.update(visitas).set(datos)
          .where(and(eq(visitas.id, id), eq(visitas.usuarioId, u.id))).returning({ id: visitas.id });
        filas = r.length;
      } else {
        await db.insert(visitas).values({ id: nuevoId, usuarioId: u.id, ...datos });
        // Quien visita o consulta queda como interesado, y si era nuevo avanza de etapa.
        if (datos.clienteId) {
          await db.insert(intereses)
            .values({ clienteId: datos.clienteId, inmuebleId: datos.inmuebleId }).onConflictDoNothing();
          if (datos.tipo === "visita") {
            await db.update(clientes).set({ estado: "visito" })
              .where(and(eq(clientes.id, datos.clienteId), eq(clientes.usuarioId, u.id),
                sql`${clientes.estado} in ('nuevo','contactado')`));
          }
        }
      }
      resumen = datos.tipo === "visita" ? "Visita" : "Consulta";
      break;
    }
  }

  if (!filas) return NO_ENCONTRADO;
  await anotar(u.id, id ? "editó" : "creó", NOMBRES[forma], nuevoId, resumen);
  if (forma === "pago" || forma === "impuesto") await asegurarRecurrentes(u.id);
  refrescar();
  return { ok: true, id: nuevoId, mensaje: FORMAS[forma].guardado };
}

/** Datos actuales de un registro, en el formato de texto que usa el formulario. */
export async function cargar(forma: string, id: string) {
  const u = await usuarioActual();
  if (!u || !ES_FORMA(forma) || !esId(id)) return null;
  const tabla = TABLAS[forma];
  const [f] = (await db
    .select()
    .from(tabla)
    .where(and(eq(tabla.id, id), eq(tabla.usuarioId, u.id)))
    .limit(1)) as Record<string, unknown>[];
  if (!f) return null;

  const valores: Record<string, string> = {};
  for (const c of FORMAS[forma].campos) {
    const v = f[c.nombre];
    if (c.tipo === "si-no") valores[c.nombre] = v ? "si" : "no";
    else if (c.tipo === "importe" || c.tipo === "numero")
      valores[c.nombre] = v == null ? "" : String(Number(v)).replace(".", ",");
    else valores[c.nombre] = v == null ? "" : String(v);
  }
  if (tabla === eventos) {
    const z = enZona(f.inicio as Date);
    valores.fecha = z.fecha;
    valores.hora = f.sinHora ? "" : z.hora;
    valores.duracionMin = String(f.duracionMin);
  }

  const entidad = FORMAS[forma].adjuntos;
  const adjuntos = entidad
    ? await db
        .select({ id: archivos.id, nombre: archivos.nombre, mime: archivos.mime })
        .from(archivos)
        .where(and(eq(archivos.usuarioId, u.id), eq(archivos.entidad, entidad), eq(archivos.entidadId, id)))
    : [];
  return { valores, adjuntos };
}

export async function borrar(forma: string, id: string): Promise<Resultado> {
  return cambiarBorrado(forma, id, true);
}

export async function restaurar(forma: string, id: string): Promise<Resultado> {
  return cambiarBorrado(forma, id, false);
}

async function cambiarBorrado(forma: string, id: string, borrado: boolean): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!ES_FORMA(forma) || !esId(id)) return NO_ENCONTRADO;
  const tabla = TABLAS[forma];
  const r = await db
    .update(tabla)
    .set({ borradoEl: borrado ? new Date() : null })
    .where(and(eq(tabla.id, id), eq(tabla.usuarioId, u.id)))
    .returning();
  if (!r.length) return NO_ENCONTRADO;
  const f = r[0] as Record<string, unknown>;
  const nombre = String(f.nombre ?? f.concepto ?? (f.persona ? `Reunión con ${f.persona}` : f.titulo) ?? "");
  await anotar(u.id, borrado ? "borró" : "recuperó", NOMBRES[forma], id, nombre);
  if (!borrado && (forma === "pago" || forma === "impuesto")) await asegurarRecurrentes(u.id);
  refrescar();
  return { ok: true, id, mensaje: borrado ? "Borrado" : "Recuperado" };
}

export async function marcarPagado(id: string, pagado: boolean, fecha?: string): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  const dia = fecha && esFecha(fecha) ? fecha : hoy();
  const r = await db
    .update(pagos)
    .set({ pagadoEl: pagado ? dia : null })
    .where(and(eq(pagos.id, id), eq(pagos.usuarioId, u.id)))
    .returning({ concepto: pagos.concepto });
  if (!r.length) return NO_ENCONTRADO;
  await anotar(u.id, pagado ? "pagó" : "volvió a dejar pendiente", "", id, r[0].concepto);
  await asegurarRecurrentes(u.id);
  refrescar();
  return { ok: true, id, mensaje: pagado ? "Marcado como pagado" : "Vuelve a estar por pagar" };
}

export async function completar(id: string, hecho: boolean): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  const r = await db
    .update(eventos)
    .set({ completadoEl: hecho ? new Date() : null })
    .where(and(eq(eventos.id, id), eq(eventos.usuarioId, u.id)))
    .returning({ id: eventos.id });
  if (!r.length) return NO_ENCONTRADO;
  refrescar();
  return { ok: true, id, mensaje: hecho ? "Tarea terminada" : "Tarea pendiente otra vez" };
}

export async function reprogramar(id: string, fecha: string, hora: string | null): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  if (!esFecha(fecha) || (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)))
    return { ok: false, error: "Esa fecha u hora no es válida." };
  const [e] = await db.select().from(eventos)
    .where(and(eq(eventos.id, id), eq(eventos.usuarioId, u.id))).limit(1);
  if (!e) return NO_ENCONTRADO;
  const horaFinal = hora ?? (e.sinHora ? null : enZona(e.inicio).hora);
  await db
    .update(eventos)
    .set({ inicio: aInstante(fecha, horaFinal ?? "00:00"), sinHora: !horaFinal })
    .where(eq(eventos.id, id));
  await anotar(u.id, "reprogramó", NOMBRES[e.tipo as Forma] ?? "evento", id, e.persona ?? e.titulo);
  refrescar();
  return { ok: true, id, mensaje: "Reprogramado" };
}

export async function moverCliente(id: string, estado: string): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id) || !ESTADOS_CLIENTE.some((e) => e.valor === estado)) return NO_ENCONTRADO;
  const r = await db.update(clientes).set({ estado })
    .where(and(eq(clientes.id, id), eq(clientes.usuarioId, u.id))).returning({ nombre: clientes.nombre });
  if (!r.length) return NO_ENCONTRADO;
  const etapa = ESTADOS_CLIENTE.find((e) => e.valor === estado)!.etiqueta;
  await anotar(u.id, "movió", "cliente", id, `${r[0].nombre} → ${etapa}`);
  refrescar();
  return { ok: true, id, mensaje: `Pasó a ${etapa}` };
}

/** "Lo contacté hoy": anota la conversación y agenda (o no) el próximo seguimiento. */
export async function contacte(id: string, diasProximo: number | null): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  const dias = diasProximo === null ? null : Math.min(Math.max(Math.round(diasProximo), 1), 365);
  const r = await db
    .update(clientes)
    .set({
      ultimaConversacion: hoy(),
      proximoSeguimiento: dias === null ? null : sumarDias(hoy(), dias),
      estado: sql`case when ${clientes.estado} = 'nuevo' then 'contactado' else ${clientes.estado} end`,
    })
    .where(and(eq(clientes.id, id), eq(clientes.usuarioId, u.id)))
    .returning({ nombre: clientes.nombre });
  if (!r.length) return NO_ENCONTRADO;
  await anotar(u.id, "contactó a", "cliente", id, r[0].nombre);
  refrescar();
  return { ok: true, id, mensaje: "Contacto anotado" };
}

export async function vincular(clienteId: string, inmuebleId: string, activo: boolean): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!(await esMio(clientes, clienteId, u.id)) || !(await esMio(inmuebles, inmuebleId, u.id)))
    return NO_ENCONTRADO;
  if (activo) await db.insert(intereses).values({ clienteId, inmuebleId }).onConflictDoNothing();
  else
    await db.delete(intereses)
      .where(and(eq(intereses.clienteId, clienteId), eq(intereses.inmuebleId, inmuebleId)));
  refrescar();
  return { ok: true, id: clienteId, mensaje: activo ? "Vinculado" : "Desvinculado" };
}

export async function marcarGastoPagado(id: string, pagado: boolean): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  const r = await db.update(gastosObra).set({ pagado })
    .where(and(eq(gastosObra.id, id), eq(gastosObra.usuarioId, u.id))).returning({ c: gastosObra.concepto });
  if (!r.length) return NO_ENCONTRADO;
  await anotar(u.id, pagado ? "pagó" : "volvió a dejar pendiente", "gasto de obra", id, r[0].c);
  refrescar();
  return { ok: true, id, mensaje: pagado ? "Marcado como pagado" : "Queda como compromiso pendiente" };
}

export async function borrarArchivo(id: string): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (!esId(id)) return NO_ENCONTRADO;
  const r = await db.delete(archivos)
    .where(and(eq(archivos.id, id), eq(archivos.usuarioId, u.id))).returning({ nombre: archivos.nombre });
  if (!r.length) return NO_ENCONTRADO;
  await anotar(u.id, "borró", "archivo", id, r[0].nombre);
  refrescar();
  return { ok: true, id, mensaje: "Archivo borrado" };
}

export async function guardarPrefs(nuevas: Prefs): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  const dias = Number(nuevas?.diasAnticipacion);
  const b = (v: unknown) => v === true;
  const prefs: Prefs = prefsCompletas({
    diasAnticipacion: Number.isFinite(dias) ? Math.min(Math.max(Math.round(dias), 1), 30) : 5,
    avisos: {
      impuestos: b(nuevas?.avisos?.impuestos), pagos: b(nuevas?.avisos?.pagos),
      seguimientos: b(nuevas?.avisos?.seguimientos), obras: b(nuevas?.avisos?.obras),
      duplicados: b(nuevas?.avisos?.duplicados),
    },
    correo: {
      diario: b(nuevas?.correo?.diario), semanal: b(nuevas?.correo?.semanal), copia: b(nuevas?.correo?.copia),
    },
  });
  await db.update(usuarios).set({ prefs }).where(eq(usuarios.id, u.id));
  refrescar();
  return { ok: true, id: u.id, mensaje: "Avisos actualizados" };
}

/** Cambia el enlace secreto del calendario: el anterior deja de funcionar. */
export async function regenerarCalendario(): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  await db.update(usuarios).set({ tokenCalendario: randomBytes(24).toString("hex") }).where(eq(usuarios.id, u.id));
  refrescar();
  return { ok: true, id: u.id, mensaje: "Enlace nuevo generado" };
}

export async function cambiarClave(actual: string, nueva: string): Promise<Resultado> {
  const u = await usuarioActual();
  if (!u) return SIN_SESION;
  if (typeof nueva !== "string" || nueva.length < 10 || nueva.length > 200)
    return { ok: false, error: "La contraseña nueva tiene que tener al menos 10 caracteres." };
  const [f] = await db.select().from(usuarios).where(eq(usuarios.id, u.id)).limit(1);
  if (!f || !(await bcrypt.compare(String(actual ?? ""), f.claveHash)))
    return { ok: false, error: "La contraseña actual no es correcta." };
  const version = f.versionSesion + 1;
  await db
    .update(usuarios)
    .set({ claveHash: await bcrypt.hash(nueva, 12), versionSesion: version })
    .where(eq(usuarios.id, u.id));
  await iniciarSesion(u.id, version); // las demás sesiones quedan cerradas
  await anotar(u.id, "cambió", "contraseña", null, "");
  return { ok: true, id: u.id, mensaje: "Contraseña cambiada" };
}
