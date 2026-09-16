export const maxDuration = 60;

const BACKEND = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

// Pings the FastAPI backend so a free-tier instance wakes up while the user is still typing.
export async function GET() {
  const started = Date.now();
  try {
    const res = await fetch(`${BACKEND}/`, { cache: "no-store", signal: AbortSignal.timeout(55_000) });
    return Response.json({ ok: res.ok, ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, ms: Date.now() - started }, { status: 504 });
  }
}
