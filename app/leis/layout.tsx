import type { Metadata } from "next";
import "./status.css";

export const metadata: Metadata = {
  title: "Leis Primeiro | SEEDF PPGE",
  description: "Trilha operacional de legislação do SEEDF: leitura dirigida, questões, flashcards, prioridades e fontes oficiais para Gestor, Apoio Administrativo e Monitor.",
};

export default function LeisLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
