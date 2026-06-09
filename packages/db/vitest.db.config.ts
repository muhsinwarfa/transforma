import { defineConfig } from "vitest/config";

// DB-level negative probes against a real (embedded) Postgres. Slow boot, so
// kept out of the fast unit run (`*.spec.ts`) and given generous timeouts.
export default defineConfig({
  test: {
    include: ["src/**/*.dbspec.ts"],
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
    pool: "forks",
  },
});
