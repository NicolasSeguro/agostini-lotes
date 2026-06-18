import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Agostini",
  description: "Sistema de gestión Grupo Agostini",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
