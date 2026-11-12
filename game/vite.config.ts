import { defineConfig } from "vite";

// base: './' — itch.io HTML5 requires a zip with top-level index.html and
// RELATIVE, case-sensitive paths (GDD Appendix C). The dev server is
// unaffected (Vite rewrites this for dev).
export default defineConfig({
  base: "./",
});
