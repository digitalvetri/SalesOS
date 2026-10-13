// Runs once when the Next.js server starts (Next 16 instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.BOOTSTRAP_OWNER_EMAIL) return;
  const { runFirstRunSetup } = await import("@/server/bootstrap/firstRun");
  try {
    await runFirstRunSetup();
  } catch (e) {
    // Never block the server from starting; the log explains what to fix.
    console.error("[first-run] setup failed:", e instanceof Error ? e.message : e);
  }
}
