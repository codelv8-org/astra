import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
export default defineConfig({
  plugins: [react(), tailwind()],
  publicDir: "../../assets",
  server: {
    https:
      process.env.TLS_KEY && process.env.TLS_CERT
        ? {
            key: readFileSync(process.env.TLS_KEY),
            cert: readFileSync(process.env.TLS_CERT),
          }
        : undefined,
    proxy: {
      "/api": {
        target: process.env.API_URL ?? "https://localhost:7443",
        secure: true,
        ws: true,
      },
    },
  },
});
