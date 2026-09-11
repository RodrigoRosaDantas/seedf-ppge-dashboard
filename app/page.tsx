import DashboardClient from "./dashboard-client";

export const dynamic = "force-static";

export default function Page() {
  return (
    <>
      <DashboardClient />
      <a
        href="./leis/index.html"
        aria-label="Abrir Leis Primeiro"
        title="Abrir Leis Primeiro"
        style={{
          position: "fixed",
          right: 18,
          bottom: 18,
          zIndex: 90,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          padding: "0 15px",
          borderRadius: 999,
          border: "1px solid rgba(246,199,90,.32)",
          background: "rgba(12,25,42,.96)",
          color: "#f7d477",
          boxShadow: "0 14px 38px rgba(0,0,0,.28)",
          textDecoration: "none",
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: ".01em",
          backdropFilter: "blur(14px)",
        }}
      >
        ⚖️ Leis Primeiro
      </a>
    </>
  );
}
