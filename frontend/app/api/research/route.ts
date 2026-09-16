export const maxDuration = 60;

const BACKEND = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

export async function POST(request: Request) {
  let query = "";
  try {
    const body = await request.json();
    query = typeof body?.query === "string" ? body.query.trim() : "";
  } catch {
    // fall through to the validation error below
  }
  if (!query) {
    return Response.json({ error: "Please enter a question." }, { status: 400 });
  }

  try {
    const response = await fetch(`${BACKEND}/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { error: data?.error || `The research service returned ${response.status}.` },
        { status: response.status }
      );
    }
    return Response.json(data);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return Response.json(
      {
        error: timedOut
          ? "The server took too long to answer. It runs on a free tier and may have been asleep — try again in 30 seconds."
          : "Could not reach the research service. Please try again.",
      },
      { status: 504 }
    );
  }
}
