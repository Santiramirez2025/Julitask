import type { Metadata } from "next";
import { PantallaPagos } from "@/components/PantallaPagos";

export const metadata: Metadata = { title: "Impuestos" };

export default async function Impuestos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  return <PantallaPagos tipo="impuesto" ver={(await searchParams).ver} />;
}
