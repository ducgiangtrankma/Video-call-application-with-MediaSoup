import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/room": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/mediasoup": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
