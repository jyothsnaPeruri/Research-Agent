export async function POST(request: Request) {
  const body = await request.json();
  const response = await fetch("http://127.0.0.1:8000/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: body.query }),
  });
  const data = await response.json();
  return Response.json(data);
}