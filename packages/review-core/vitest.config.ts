import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // DB-integration specs self-skip unless SUPABASE_DB_URL is set (see helpers).
    passWithNoTests: false,
  },
});
