import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      // 127.0.0.1, not localhost: the server binds IPv4 loopback and
      // "localhost" may resolve to ::1 first, breaking the proxy on some
      // systems (e.g. macOS). vite preview inherits this proxy (used by e2e).
      "/ws": { target: "ws://127.0.0.1:3000", ws: true },
    },
  },
});
