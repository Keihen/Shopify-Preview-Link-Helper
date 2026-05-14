import { readFileSync } from "node:fs";

import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";

const manifest = JSON.parse(
  readFileSync(new URL("./manifest.json", import.meta.url), "utf-8")
);

export default defineConfig({
  base: "./",
  plugins: [crx({ manifest })]
});
