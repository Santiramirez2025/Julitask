import type { Metadata, Viewport } from "next";
import "@fontsource-variable/figtree";
import "./globals.css";
import { RegistrarSW } from "@/components/RegistrarSW";

export const metadata: Metadata = {
  title: { default: "Julián OS", template: "%s · Julián OS" },
  description: "Tu día, tus pagos, tus clientes y tus obras en un solo lugar.",
  applicationName: "Julián OS",
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Julián OS", statusBarStyle: "default" },
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
