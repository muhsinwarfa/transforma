/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The enforcement core + db codec are workspace TS packages compiled by Next.
  transpilePackages: ["@transforma/review-core", "@transforma/db"],
  // NOTE: `typedRoutes` (experimental, DX-only typed <Link>/router hrefs) is left
  // OFF. The app uses dynamic routes (e.g. /nominations/[id]) that need explicit
  // `as Route` casts to satisfy it; it was never actually enforced (it only adds
  // types under `next build`, which had never completed). Full `tsc` type-checking
  // is unaffected. Re-enable + add Route casts later as a DX improvement if wanted.
  webpack: (config) => {
    // The workspace TS packages use NodeNext-style ".js" import specifiers that
    // resolve to ".ts" sources (e.g. `export * from "./ids.js"` → ids.ts). tsx
    // (worker), vitest, and `next dev` map .js→.ts automatically; the production
    // webpack build does not, so transpilePackages fails with "Can't resolve
    // ./ids.js". Teach webpack the same mapping (.js still resolves real .js files
    // via the fallback, so nothing else breaks).
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
