"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Paperclip, ScanLine, Trash2, X, FileText, TriangleAlert } from "lucide-react";
import { Hoja } from "./Hoja";
import { useApp } from "./Proveedor";
import { FORMAS, type Campo, type Forma } from "@/lib/entidades";
import { guardar, cargar, borrar, restaurar, borrarArchivo } from "@/lib/acciones/datos";
import { hoy } from "@/lib/fechas";
import { comprimirImagen, subirArchivo } from "@/lib/cliente";

type Adjunto = { id: string; nombre: string; mime: string };

function valoresIniciales(forma: Forma, inicial?: Record<string, string>) {
  const v: Record<string, string> = {};
  for (const c of FORMAS[forma].campos) v[c.nombre] = c.inicial === "hoy" ? hoy() : (c.inicial ?? "");
  return { ...v, ...inicial };
}

export function Formulario({
  forma,
  id,
  inicial,
  alCerrar,
}: {
  forma: Forma;
  id?: string;
  inicial?: Record<string, string>;
  alCerrar: () => void;
}) {
  const def = FORMAS[forma];
  const app = useApp();
  const router = useRouter();
  const [valores, setValores] = useState(() => valoresIniciales(forma, inicial));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [conflicto, setConflicto] = useState("");
  const [cargando, setCargando] = useState(Boolean(id));
  const [guardando, setGuardando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [notaLectura, setNotaLectura] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [pendientes, setPendientes] = useState<File[]>([]);
  const [detalles, setDetalles] = useState(() =>
    def.campos.some((c) => c.detalle && inicial?.[c.nombre]),
  );
  const archivoRef = useRef<HTMLInputElement>(null);
  const facturaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    cargar(forma, id).then((r) => {
      if (!vigente) return;
      if (!r) {
        app.avisar("No se encontró. Puede que ya se haya borrado.", { error: true });
        alCerrar();
        return;
      }
      setValores(r.valores);
      setAdjuntos(r.adjuntos);
      setDetalles(def.campos.some((c) => c.detalle && r.valores[c.nombre] && r.valores[c.nombre] !== c.inicial));
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forma, id]);

  const poner = (nombre: string, valor: string) => {
    setValores((v) => ({ ...v, [nombre]: valor }));
    if (errores[nombre]) setErrores((e) => ({ ...e, [nombre]: "" }));
    setConflicto("");
  };

  async function enviar(forzar = false) {
    if (guardando) return;
    setGuardando(true);
    setErrorGeneral("");
    try {
      const r = await guardar(forma, valores, id ?? null, { forzar });
      if (!r.ok) {
        if (r.errores) {
          setErrores(r.errores);
          if (def.campos.some((c) => c.detalle && r.errores![c.nombre])) setDetalles(true);
        }
        if (r.conflicto) setConflicto(r.conflicto);
        if (r.error) setErrorGeneral(r.error);
        return;
      }
      let fallaron = 0;
      for (const f of pendientes) {
        const s = await subirArchivo(f, def.adjuntos!, r.id);
        if (!s.ok) fallaron++;
      }
      if (pendientes.length) router.refresh();
      if (fallaron)
        app.avisar(`${def.guardado}, pero no se pudo subir ${fallaron === 1 ? "un archivo" : `${fallaron} archivos`}.`, { error: true });
      else app.avisar(r.mensaje);
      alCerrar();
    } catch {
      setErrorGeneral("No se pudo guardar. Revisá tu conexión y probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar() {
    if (!id) return;
    const repetido = (forma === "pago" || forma === "impuesto") && valores.repite && valores.repite !== "no";
    const ok = await app.confirmar(
      repetido
        ? "¿Borrar este vencimiento? Si es el último de la serie, deja de repetirse."
        : forma === "obra"
          ? "¿Borrar esta obra con todos sus gastos?"
          : "¿Borrar esto?",
    );
    if (!ok) return;
    const r = await borrar(forma, id);
    if (!r.ok) {
      setErrorGeneral(r.error ?? "No se pudo borrar.");
      return;
    }
    alCerrar();
    app.avisar("Borrado", { deshacer: () => restaurar(forma, id) });
    if (forma === "obra" || forma === "cliente" || forma === "inmueble") router.push(`/${forma === "obra" ? "obras" : forma + "s"}`);
  }

  async function leerFactura(archivo: File) {
    setLeyendo(true);
    setNotaLectura("");
    try {
      const chico = await comprimirImagen(archivo);
      const fd = new FormData();
      fd.append("archivo", chico);
      const r = await fetch("/api/leer-factura", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) {
        setNotaLectura(j.error ?? "No pude leer la factura. Completá los datos a mano.");
      } else {
        setValores((v) => ({
          ...v,
          concepto: j.concepto || v.concepto,
          proveedor: j.proveedor || v.proveedor,
          importe: j.importe || v.importe,
          moneda: j.moneda || v.moneda,
          vence: j.vence || v.vence,
        }));
        setNotaLectura("Datos sugeridos por la lectura automática. Revisalos antes de guardar: queda como pendiente de pago.");
      }
      setPendientes((p) => [...p, chico]);
    } catch {
      setNotaLectura("No pude leer la factura. Completá los datos a mano.");
    } finally {
      setLeyendo(false);
    }
  }

  const principales = def.campos.filter((c) => !c.detalle && !esMoneda(def.campos, c));
  const secundarios = def.campos.filter((c) => c.detalle && !esMoneda(def.campos, c));
  const puedeLeer = app.iaActiva && !id && (forma === "pago" || forma === "impuesto");

  return (
    <Hoja
      abierta
      alCerrar={alCerrar}
      titulo={id ? def.tituloEditar : def.titulo}
      pie={
        !cargando && (
          <div className="flex gap-3">
            {id && (
              <button
                type="button"
                onClick={eliminar}
                className="boton boton-suave shrink-0 px-4 text-rojo"
                aria-label="Borrar"
              >
                <Trash2 aria-hidden size={21} />
              </button>
            )}
            <button type="submit" form={`form-${forma}`} disabled={guardando} className="boton flex-1">
              {guardando ? "Guardando…" : def.guardar}
            </button>
          </div>
        )
      }
    >
      {cargando ? (
        <div className="space-y-4 py-2" aria-busy="true" aria-label="Cargando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[3.1rem] animate-pulse rounded-[14px] bg-hundido" />
          ))}
        </div>
      ) : (
        <form
          id={`form-${forma}`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="space-y-4"
        >
          {puedeLeer && (
            <>
              <input
                ref={facturaRef}
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) leerFactura(f);
                }}
              />
              <button
                type="button"
                disabled={leyendo}
                onClick={() => facturaRef.current?.click()}
                className="boton boton-suave w-full"
              >
                <ScanLine aria-hidden size={21} />
                {leyendo ? "Leyendo la factura…" : "Completar con una foto de la factura"}
              </button>
            </>
          )}
          {notaLectura && (
            <p className="rounded-[14px] bg-ambar-claro px-3.5 py-2.5 text-[0.94rem] text-ambar">{notaLectura}</p>
          )}

          {principales.map((c) => (
            <CampoForm key={c.nombre} campo={c} valores={valores} error={errores[c.nombre]} poner={poner} />
          ))}

          {def.adjuntos && (
            <div>
              <input
                ref={archivoRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={async (e) => {
                  const lista = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  const listos = await Promise.all(lista.map(comprimirImagen));
                  setPendientes((p) => [...p, ...listos]);
                }}
              />
              {(adjuntos.length > 0 || pendientes.length > 0) && (
                <ul className="mb-2 space-y-2">
                  {adjuntos.map((a) => (
                    <li key={a.id} className="tarjeta flex items-center gap-2 rounded-[14px] py-1.5 pr-1.5 pl-3.5">
                      <FileText aria-hidden size={19} className="shrink-0 text-tenue" />
                      <a href={`/api/archivos/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-marino underline">
                        {a.nombre}
                      </a>
                      <button
                        type="button"
                        aria-label={`Borrar ${a.nombre}`}
                        className="grid size-11 place-items-center rounded-xl text-rojo hover:bg-rojo-claro"
                        onClick={async () => {
                          if (!(await app.confirmar(`¿Borrar el archivo «${a.nombre}»? No se puede deshacer.`))) return;
                          const r = await borrarArchivo(a.id);
                          if (r.ok) setAdjuntos((l) => l.filter((x) => x.id !== a.id));
                        }}
                      >
                        <Trash2 aria-hidden size={19} />
                      </button>
                    </li>
                  ))}
                  {pendientes.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-[14px] bg-hundido py-1.5 pr-1.5 pl-3.5">
                      <Paperclip aria-hidden size={18} className="shrink-0 text-tenue" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        aria-label={`Quitar ${f.name}`}
                        className="grid size-11 place-items-center rounded-xl hover:bg-linea"
                        onClick={() => setPendientes((p) => p.filter((_, j) => j !== i))}
                      >
                        <X aria-hidden size={19} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" onClick={() => archivoRef.current?.click()} className="boton boton-suave boton-chico">
                <Paperclip aria-hidden size={18} /> Adjuntar comprobante
              </button>
            </div>
          )}

          {secundarios.length > 0 && (
            <div>
              <button
                type="button"
                aria-expanded={detalles}
                onClick={() => setDetalles((d) => !d)}
                className="flex min-h-11 items-center gap-1.5 font-bold text-marino"
              >
                <ChevronDown aria-hidden size={20} className={detalles ? "rotate-180 transition-transform" : "transition-transform"} />
                {detalles ? "Menos detalles" : "Más detalles"}
              </button>
              {detalles && (
                <div className="mt-2 space-y-4">
                  {secundarios.map((c) => (
                    <CampoForm key={c.nombre} campo={c} valores={valores} error={errores[c.nombre]} poner={poner} />
                  ))}
                </div>
              )}
            </div>
          )}

          {conflicto && (
            <div role="alert" className="rounded-[14px] bg-ambar-claro p-3.5 text-ambar">
              <p className="flex gap-2 font-semibold">
                <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0" /> {conflicto}
              </p>
              <button type="button" className="boton boton-chico mt-2.5" onClick={() => enviar(true)}>
                Guardar igual
              </button>
            </div>
          )}
          {errorGeneral && (
            <p role="alert" className="rounded-[14px] bg-rojo-claro px-3.5 py-2.5 font-semibold text-rojo">
              {errorGeneral}
            </p>
          )}
        </form>
      )}
    </Hoja>
  );
}

function esMoneda(campos: Campo[], c: Campo) {
  return campos.some((x) => x.campoMoneda === c.nombre);
}

function CampoForm({
  campo: c,
  valores,
  error,
  poner,
}: {
  campo: Campo;
  valores: Record<string, string>;
  error?: string;
  poner: (nombre: string, valor: string) => void;
}) {
  const app = useApp();
  const uid = useId();
  const valor = valores[c.nombre] ?? "";
  const comunes = {
    id: uid,
    name: c.nombre,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${uid}-e` : c.ayuda ? `${uid}-a` : undefined,
    className: "campo",
  } as const;

  let control: React.ReactNode;
  let grupo = false;

  switch (c.tipo) {
    case "notas":
      control = <textarea {...comunes} rows={3} value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "importe": {
      const campoMoneda = c.campoMoneda ?? "moneda";
      const moneda = valores[campoMoneda] || "ARS";
      control = (
        <div className="flex gap-2">
          <div className="flex shrink-0 rounded-[14px] bg-hundido p-1" role="group" aria-label="Moneda">
            {(["ARS", "USD"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={moneda === m}
                onClick={() => poner(campoMoneda, m)}
                className={`min-h-[2.6rem] rounded-[10px] px-3 font-bold ${moneda === m ? "bg-marino text-white" : "text-tenue"}`}
              >
                {m === "ARS" ? "$" : "US$"}
                <span className="sr-only">{m === "ARS" ? " pesos" : " dólares"}</span>
              </button>
            ))}
          </div>
          <input
            {...comunes}
            className="campo cifra text-[1.15rem] font-bold"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={valor}
            onChange={(e) => poner(c.nombre, e.target.value)}
          />
        </div>
      );
      break;
    }
    case "numero":
      control = <input {...comunes} inputMode="decimal" autoComplete="off" value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "fecha":
      control = <input {...comunes} type="date" value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "hora":
      control = <input {...comunes} type="time" value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "telefono":
      control = <input {...comunes} type="tel" inputMode="tel" autoComplete="off" value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "email":
      control = <input {...comunes} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" value={valor} onChange={(e) => poner(c.nombre, e.target.value)} />;
      break;
    case "si-no":
      return (
        <div>
          <label className="tarjeta flex min-h-[3.1rem] cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-2 font-semibold">
            <input
              type="checkbox"
              className="size-6 accent-[var(--color-verde)]"
              checked={valor === "si"}
              aria-describedby={c.ayuda ? `${uid}-a` : undefined}
              onChange={(e) => poner(c.nombre, e.target.checked ? "si" : "no")}
            />
            {c.etiqueta}
          </label>
          {c.ayuda && <p id={`${uid}-a`} className="mt-1.5 text-[0.9rem] text-tenue">{c.ayuda}</p>}
        </div>
      );
    case "opciones": {
      const ops = c.opciones ?? [];
      if (ops.length <= 8) {
        grupo = true;
        control = (
          <div className="flex flex-wrap gap-2">
            {ops.map((o) => (
              <label
                key={o.valor}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 font-semibold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-marino-2 ${
                  valor === o.valor ? "bg-marino text-white" : "bg-tarjeta text-tinta shadow-[inset_0_0_0_1.5px_#cfc8bb]"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`${uid}-${c.nombre}`}
                  value={o.valor}
                  checked={valor === o.valor}
                  onChange={() => poner(c.nombre, o.valor)}
                />
                {o.etiqueta}
              </label>
            ))}
          </div>
        );
      } else {
        control = (
          <select {...comunes} value={valor} onChange={(e) => poner(c.nombre, e.target.value)}>
            {ops.map((o) => (
              <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
            ))}
          </select>
        );
      }
      break;
    }
    case "obra":
    case "cliente":
    case "inmueble": {
      const lista = c.tipo === "obra" ? app.opciones.obras : c.tipo === "cliente" ? app.opciones.clientes : app.opciones.inmuebles;
      if (c.requerido && lista.length === 0) {
        return (
          <div className="rounded-[14px] bg-ambar-claro p-3.5 text-ambar">
            <p className="font-semibold">
              {c.tipo === "obra" ? "Todavía no cargaste ninguna obra." : "Todavía no cargaste ningún inmueble."}
            </p>
            <button
              type="button"
              className="boton boton-chico mt-2.5"
              onClick={() => app.abrirFormulario(c.tipo === "obra" ? "obra" : "inmueble")}
            >
              {c.tipo === "obra" ? "Crear una obra" : "Crear un inmueble"}
            </button>
          </div>
        );
      }
      control = (
        <select {...comunes} value={valor} onChange={(e) => poner(c.nombre, e.target.value)}>
          <option value="">{c.requerido ? "Elegir…" : "Ninguno"}</option>
          {lista.map((o) => (
            <option key={o.id} value={o.id}>{o.nombre}</option>
          ))}
        </select>
      );
      break;
    }
    default:
      control = (
        <input
          {...comunes}
          type="text"
          autoComplete="off"
          placeholder={c.ejemplo}
          value={valor}
          onChange={(e) => poner(c.nombre, e.target.value)}
        />
      );
  }

  const Envoltura = grupo ? "fieldset" : "div";
  const Etiqueta = grupo ? "legend" : "label";
  return (
    <Envoltura>
      <Etiqueta {...(grupo ? {} : { htmlFor: uid })} className="mb-1.5 block font-bold">
        {c.etiqueta}
        {!c.requerido && c.tipo !== "opciones" && <span className="font-normal text-tenue"> (opcional)</span>}
      </Etiqueta>
      {control}
      {c.ayuda && !error && <p id={`${uid}-a`} className="mt-1.5 text-[0.9rem] text-tenue">{c.ayuda}</p>}
      {error && <p id={`${uid}-e`} role="alert" className="mt-1.5 font-semibold text-rojo">{error}</p>}
    </Envoltura>
  );
}
