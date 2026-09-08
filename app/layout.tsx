import type { Metadata } from "next";
import "./globals.css";

const siteBasePath =
  process.env.GITHUB_PAGES === "1"
    ? process.env.GITHUB_PAGES_BASE_PATH ?? ""
    : "";

export const metadata: Metadata = {
  title: "SEEDF PPGE — Dashboard PRO",
  description: "Central de comando da preparação pré-edital para Gestor PPGE, Analista PPGE — Apoio Administrativo e Analista PPGE — Monitor.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: `${siteBasePath}/favicon.svg`,
    shortcut: `${siteBasePath}/favicon.svg`,
  },
  manifest: `${siteBasePath}/manifest.webmanifest`,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
