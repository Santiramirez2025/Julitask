"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Desplegable que filtra cambiando un parámetro de la dirección. */
export function SelectorUrl({
  parametro,
  etiqueta,
  todos,
  opciones,
}: {
  parametro: string;
  etiqueta: string;
  todos: string;
  opciones: { valor: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  return (
    <label className="block min-w-0 flex-1">
      <span className="sr-only">{etiqueta}</span>
      <select
        className="campo"
        value={sp.get(parametro) ?? ""}
        onChange={(e) => {
          const p = new URLSearchParams(sp);
          if (e.target.value) p.set(parametro, e.target.value);
          else p.delete(parametro);
          const q = p.toString();
          router.replace(q ? `${ruta}?${q}` : ruta, { scroll: false });
        }}
      >
        <option value="">{todos}</option>
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>{o.etiqueta}</option>
        ))}
      </select>
    </label>
  );
}
