/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The enforcement core + db codec are workspace TS packages compiled by Next.
  transpilePackages: ["@transforma/review-core", "@transforma/db"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
