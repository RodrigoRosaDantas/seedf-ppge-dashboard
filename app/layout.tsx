import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEEDF PPGE — Dashboard PRO",
  description: "Central de comando da preparação pré-edital para Gestor PPGE, Analista PPGE — Apoio Administrativo e Analista PPGE — Monitor.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
