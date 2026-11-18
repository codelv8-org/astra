import { readFileSync } from "node:fs";
import { createServer } from "./server.js";
const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw Error(`Missing ${key}`);
  return v;
};
const origin = required("WEB_ORIGIN");
if (!origin.startsWith("https://")) throw Error("HTTPS Web origin required");
const app = await createServer({
  databaseUrl: required("DATABASE_URL"),
  origin,
  tls: {
    key: readFileSync(required("TLS_KEY")),
    cert: readFileSync(required("TLS_CERT")),
  },
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 7443),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void app.close());
