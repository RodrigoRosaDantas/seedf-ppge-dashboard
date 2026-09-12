import DashboardClient from "./dashboard-client";

export const dynamic = "force-static";

export default function Page() {
  return (
    <>
      <DashboardClient />
      <a
        className="law-fab"
        href="./leis/index.html"
        aria-label="Abrir trilha Leis Primeiro"
        title="Abrir trilha Leis Primeiro"
      >
        <span aria-hidden="true">⚖️</span>
        <span>Leis Primeiro</span>
      </a>
    </>
  );
}
