import type { Metadata } from "next";
import { PantallaPagos } from "@/components/PantallaPagos";

export const metadata: Metadata = { title: "Pagos" };

export default async function Pagos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  return <PantallaPagos tipo="personal" ver={(await searchParams).ver} />;
}
