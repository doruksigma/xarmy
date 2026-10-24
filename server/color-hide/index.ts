import { createColorHideServer } from "./server";

const allowedOrigins = (
  process.env.COLOR_HIDE_ALLOWED_ORIGINS ||
  "http://localhost:3000,http://127.0.0.1:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be a valid TCP port.");
const server = createColorHideServer({ allowedOrigins });
void server
  .listen(port)
  .then(() => {
    console.log(`Color Hide WebSocket sunucusu ${port} portunda hazır.`);
  })
  .catch(() => {
    console.error("Color Hide sunucusu başlatılamadı.");
    process.exitCode = 1;
  });
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void server.close().then(() => process.exit(0));
  });
