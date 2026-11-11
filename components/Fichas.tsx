"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, FileText, FileUp, PhoneCall, Plus, Share2, Trash2, X } from "lucide-react";
import { Hoja } from "./Hoja";
import { useApp } from "./Proveedor";
import { contacte, vincular, borrarArchivo, borrar, restaurar } from "@/lib/acciones/datos";
import { comprimirImagen, subirArchivo } from "@/lib/cliente";

/** "Lo contacté hoy": un toque para anotar y elegir cuándo volver a hablarle. */
export function Contacte({ id, nombre, className = "boton" }: { id: string; nombre: string; className?: string }) {
  const app = useApp();
  const [abierta, setAbierta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const elegir = (dias: number | null) =>
    iniciar(async () => {
      const r = await contacte(id, dias);
      setAbierta(false);
      if (r.ok) app.avisar(r.mensaje);
      else app.avisar(r.error ?? "No se pudo guardar.", { error: true });
    });
  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <PhoneCall aria-hidden size={19} /> Lo contacté
      </button>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="¿Cuándo le volvés a hablar?">
        <p className="mb-3 text-tenue">Queda anotado que hoy hablaste con {nombre}.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ["En 3 días", 3],
            ["En una semana", 7],
            ["En 15 días", 15],
            ["En un mes", 30],
          ].map(([t, d]) => (
            <button key={t} type="button" disabled={pendiente} className="boton boton-suave" onClick={() => elegir(d as number)}>
              {t}
            </button>
          ))}
        </div>
        <button type="button" disabled={pendiente} className="boton boton-suave mt-2.5 w-full" onClick={() => elegir(null)}>
          No hace falta volver a contactarlo
        </button>
      </Hoja>
    </>
  );
}

/** Relación cliente ↔ inmueble, editable desde cualquiera de las dos fichas. */
export function Vinculos({
  lado,
  propioId,
  vinculados,
  disponibles,
}: {
  lado: "cliente" | "inmueble";
  propioId: string;
  vinculados: { id: string; nombre: string; detalle?: string | null }[];
  disponibles: { id: string; nombre: string }[];
}) {
  const app = useApp();
  const [pendiente, iniciar] = useTransition();
  const otro = lado === "cliente" ? "inmueble" : "cliente";
  const cambiar = (otroId: string, activo: boolean) =>
    iniciar(async () => {
      const r = lado === "cliente" ? await vincular(propioId, otroId, activo) : await vincular(otroId, propioId, activo);
      if (!r.ok) app.avisar(r.error ?? "No se pudo guardar.", { error: true });
    });
  const libres = disponibles.filter((d) => !vinculados.some((v) => v.id === d.id));
  return (
    <div className="tarjeta overflow-hidden">
      {vinculados.length > 0 && (
        <ul className="divide-y divide-linea">
          {vinculados.map((v) => (
            <li key={v.id} className="flex items-center gap-2 py-1 pr-1.5 pl-4">
              <Link href={`/${otro}s/${v.id}`} className="min-w-0 flex-1 py-2">
                <span className="block truncate font-bold text-marino underline underline-offset-2">{v.nombre}</span>
                {v.detalle && <span className="block truncate text-[0.93rem] text-tenue">{v.detalle}</span>}
              </Link>
              <button
                type="button"
                disabled={pendiente}
                aria-label={`Quitar ${v.nombre}`}
                className="grid size-11 place-items-center rounded-xl text-tenue hover:bg-hundido"
                onClick={() => cambiar(v.id, false)}
              >
                <X aria-hidden size={20} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {libres.length > 0 ? (
        <label className={`block p-3 ${vinculados.length ? "border-t border-linea" : ""}`}>
          <span className="sr-only">Agregar {otro}</span>
          <select
            className="campo"
            value=""
            disabled={pendiente}
            onChange={(e) => e.target.value && cambiar(e.target.value, true)}
          >
            <option value="">{lado === "cliente" ? "Agregar un inmueble que le interesa…" : "Agregar un cliente interesado…"}</option>
            {libres.map((d) => (
              <option key={d.id} value={d.id}>{d.nombre}</option>
            ))}
          </select>
        </label>
      ) : (
        vinculados.length === 0 && (
          <p className="px-4 py-4 text-tenue">
            {lado === "cliente" ? "Todavía no cargaste inmuebles para asociar." : "Todavía no cargaste clientes para asociar."}
          </p>
        )
      )}
    </div>
  );
}

type Archivo = { id: string; nombre: string; mime: string };

function useSubida(entidad: string, entidadId: string, esFoto: boolean) {
  const app = useApp();
  const router = useRouter();
  const [subiendo, setSubiendo] = useState(0);
  const subir = async (lista: File[]) => {
    if (!lista.length) return;
    setSubiendo(lista.length);
    let errores = 0;
    let ultimoError = "";
    for (const f of lista) {
      const r = await subirArchivo(await comprimirImagen(f), entidad, entidadId, esFoto);
      if (!r.ok) {
        errores++;
        ultimoError = r.error;
      }
      setSubiendo((n) => n - 1);
    }
    setSubiendo(0);
    router.refresh();
    if (errores) app.avisar(ultimoError, { error: true });
    else app.avisar(lista.length === 1 ? "Archivo guardado" : `${lista.length} archivos guardados`);
  };
  return { subir, subiendo };
}

export function Fotos({ inmuebleId, fotos }: { inmuebleId: string; fotos: Archivo[] }) {
  const app = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const { subir, subiendo } = useSubida("inmueble", inmuebleId, true);
  const [, iniciar] = useTransition();
  return (
    <div>
      {fotos.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((f, i) => (
            <li key={f.id} className={`relative overflow-hidden rounded-[16px] bg-hundido ${i === 0 ? "col-span-2 aspect-[16/10] sm:col-span-3" : "aspect-square"}`}>
              <a href={`/api/archivos/${f.id}`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/archivos/${f.id}`} alt={`Foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} className="size-full object-cover" />
              </a>
              <button
                type="button"
                aria-label={`Borrar foto ${i + 1}`}
                className="absolute top-1.5 right-1.5 grid size-11 place-items-center rounded-full bg-tinta/75 text-white hover:bg-tinta"
                onClick={async () => {
                  if (!(await app.confirmar("¿Borrar esta foto? No se puede deshacer."))) return;
                  iniciar(async () => {
                    await borrarArchivo(f.id);
                  });
                }}
              >
                <Trash2 aria-hidden size={19} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = "";
          subir(lista);
        }}
      />
      <button type="button" disabled={subiendo > 0} className="boton boton-suave w-full" onClick={() => ref.current?.click()}>
        <Camera aria-hidden size={20} />
        {subiendo > 0 ? `Subiendo… faltan ${subiendo}` : fotos.length ? "Agregar más fotos" : "Agregar fotos"}
      </button>
    </div>
  );
}

export function Documentos({ entidad, entidadId, archivos }: { entidad: "cliente" | "inmueble"; entidadId: string; archivos: Archivo[] }) {
  const app = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const { subir, subiendo } = useSubida(entidad, entidadId, false);
  const [, iniciar] = useTransition();
  return (
    <div>
      {archivos.length > 0 && (
        <ul className="tarjeta mb-3 divide-y divide-linea overflow-hidden">
          {archivos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-1 pr-1.5 pl-4">
              <FileText aria-hidden size={20} className="shrink-0 text-tenue" />
              <a href={`/api/archivos/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate py-2.5 font-semibold text-marino underline underline-offset-2">
                {a.nombre}
              </a>
              <button
                type="button"
                aria-label={`Borrar ${a.nombre}`}
                className="grid size-11 place-items-center rounded-xl text-rojo hover:bg-rojo-claro"
                onClick={async () => {
                  if (!(await app.confirmar(`¿Borrar «${a.nombre}»? No se puede deshacer.`))) return;
                  iniciar(async () => {
                    await borrarArchivo(a.id);
                  });
                }}
              >
                <Trash2 aria-hidden size={19} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = "";
          subir(lista);
        }}
      />
      <button type="button" disabled={subiendo > 0} className="boton boton-suave boton-chico" onClick={() => ref.current?.click()}>
        <FileUp aria-hidden size={18} /> {subiendo > 0 ? "Subiendo…" : "Guardar un documento"}
      </button>
    </div>
  );
}

/** Comparte la ficha: con el PDF adjunto si el celular lo permite; si no, texto por WhatsApp. */
export function CompartirFicha({ id, nombre, texto }: { id: string; nombre: string; texto: string }) {
  const [preparando, setPreparando] = useState(false);
  const compartir = async () => {
    setPreparando(true);
    try {
      const r = await fetch(`/api/exportar/ficha?id=${id}`);
      if (r.ok) {
        const archivo = new File([await r.blob()], `${nombre}.pdf`, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [archivo] })) {
          await navigator.share({ files: [archivo], title: nombre, text: texto });
          return;
        }
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    } catch (e) {
      // El usuario cerró el panel de compartir: no hay nada que avisar.
      if ((e as Error)?.name !== "AbortError")
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    } finally {
      setPreparando(false);
    }
  };
  return (
    <button type="button" disabled={preparando} className="boton boton-verde" onClick={compartir}>
      <Share2 aria-hidden size={20} /> {preparando ? "Preparando…" : "Compartir"}
    </button>
  );
}

export function BotonVisita({ inmuebleId, clienteId }: { inmuebleId?: string; clienteId?: string }) {
  const app = useApp();
  return (
    <button
      type="button"
      aria-label="Registrar visita o consulta"
      className="boton boton-suave boton-chico shrink-0"
      onClick={() =>
        app.abrirFormulario("visita", {
          inicial: { ...(inmuebleId ? { inmuebleId } : {}), ...(clienteId ? { clienteId } : {}) },
        })
      }
    >
      <Plus aria-hidden size={18} /> Registrar
    </button>
  );
}

export function BorrarVisita({ id }: { id: string }) {
  const app = useApp();
  const [, iniciar] = useTransition();
  return (
    <button
      type="button"
      aria-label="Borrar registro"
      className="grid size-11 shrink-0 place-items-center rounded-xl text-tenue hover:bg-hundido"
      onClick={() =>
        iniciar(async () => {
          const r = await borrar("visita", id);
          if (r.ok) app.avisar("Borrado", { deshacer: () => restaurar("visita", id) });
        })
      }
    >
      <X aria-hidden size={19} />
    </button>
  );
}
