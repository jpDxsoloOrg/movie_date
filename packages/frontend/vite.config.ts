import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
    // The Cognito SDK pulls in `buffer`, which reads a bare `global`. The production
    // bundler rewrites that but the dev server's prebundle doesn't, so without this
    // `npm run dev` dies on load.
    global: "globalThis",
  },
  plugins: [
    react(),
    VitePWA({
      // "script" injects a bare register() call. The virtual:pwa-register client
      // would reload the page when an update lands, which would throw someone out
      // of the deck mid-swipe; the spec wants updates to apply on the next load.
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: ["favicon-32.png", "apple-touch-icon.png", "movieDate.png", "icons/*.{png,svg}"],
      manifest: {
        name: "Movie Date",
        short_name: "Movie Date",
        description: "Swipe on movies together until you match.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: "#000000",
        background_color: "#ff5f6d",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
        // 44 tutorial screenshots would add megabytes to every install and update, and a
        // device only ever shows one theme at one size. Ignored here even though webp isn't
        // in globPatterns, so adding it there later can't pull them in.
        globIgnores: ["**/tutorial-*.webp"],
        // Only the tutorial's own images get a route. The API is cross-origin POST and
        // websocket traffic, so with no route for it the worker leaves it on the network.
        // The shots are hashed into /assets/, so CacheFirst never serves a stale one, and a
        // step seen once works offline when the tutorial is reopened from the menu.
        runtimeCaching: [
          {
            urlPattern: ({ url, request, sameOrigin }) =>
              sameOrigin &&
              request.method === "GET" &&
              request.destination === "image" &&
              url.pathname.startsWith("/assets/tutorial-"),
            handler: "CacheFirst",
            options: {
              cacheName: "tutorial-images",
              expiration: { maxEntries: 60 },
            },
          },
        ],
      },
    }),
  ],
});
