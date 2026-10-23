import { simulationWorkerEntry } from "../strategy/worker-bootstrap";

export function GET(request: Request) {
  const entry = simulationWorkerEntry(new URL(request.url));
  if (!entry) return new Response("Invalid simulation worker entry", { status: 400 });
  // Next may report its internal origin behind a reverse proxy. Resolve the
  // validated asset path against the worker's public origin in the browser.
  return new Response(`importScripts(${JSON.stringify(entry.pathname)});`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
