import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sin conexión" };

export default function SinConexion() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-[1.9rem] leading-tight font-bold text-marino">No hay conexión</h1>
      <p className="mt-2 text-tenue">Julitask necesita internet para mostrar tus datos al día. Cuando vuelva la señal, tocá el botón.</p>
      {/* Enlace común (no <Link>): tiene que funcionar aunque no haya cargado nada más. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="boton mt-6">Probar de nuevo</a>
    </main>
  );
}
