import type { Metadata } from "next";
import { FormRecuperar } from "@/components/FormAcceso";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function Recuperar() {
  return (
    <>
      <h1 className="mb-2 text-[1.9rem] leading-tight font-bold text-marino">Recuperar contraseña</h1>
      <p className="mb-5 text-tenue">Te mandamos un enlace por correo para que elijas una nueva.</p>
      <FormRecuperar />
    </>
  );
}
