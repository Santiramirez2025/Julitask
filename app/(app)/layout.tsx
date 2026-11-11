import { exigirUsuario, iaDisponible } from "@/lib/auth";
import { opcionesFormularios } from "@/lib/consultas";
import { Proveedor } from "@/components/Proveedor";
import { Barra } from "@/components/Barra";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
  const opciones = await opcionesFormularios(u.id);
  return (
    <Proveedor opciones={opciones} iaActiva={iaDisponible()}>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-xl focus:bg-marino focus:px-4 focus:py-3 focus:text-white"
      >
        Ir al contenido
      </a>
      <Barra />
      <main id="contenido" className="mx-auto max-w-3xl px-4 pt-2 pb-32">
        {children}
      </main>
    </Proveedor>
  );
}
