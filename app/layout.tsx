import type { Metadata } from "next";
import "./globals.css";
import "./study-os.css";

const siteBasePath =
  process.env.GITHUB_PAGES === "1"
    ? process.env.GITHUB_PAGES_BASE_PATH ?? ""
    : "";

export const metadata: Metadata = {
  title: "SEEDF PPGE — Central de Comando",
  description: "Painel público de preparação pré-edital SEEDF com próxima ação, continuidade, desempenho e evidências sincronizadas do Notion.",
  other: {
    "codex-preview": "development",
    "theme-color": "#071824",
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
      <head>
        <script src={`${siteBasePath}/reading-preferences.js`} defer />
      </head>
      <body>{children}<script src={`${siteBasePath}/sw-register.js`} defer /></body>
    </html>
  );
}
