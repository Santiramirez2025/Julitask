import type { Metadata, Viewport } from "next";
import "@fontsource-variable/figtree";
import "./globals.css";
import { RegistrarSW } from "@/components/RegistrarSW";

export const metadata: Metadata = {
  title: { default: "Julitask", template: "%s · Julitask" },
  description: "Tu día, tus pagos, tus clientes y tus obras en un solo lugar.",
  applicationName: "Julitask",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Julitask", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/iconos/icono-32.png", sizes: "32x32", type: "image/png" },
      { url: "/iconos/icono-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/iconos/apple-touch-icon.png",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#faf7f2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
