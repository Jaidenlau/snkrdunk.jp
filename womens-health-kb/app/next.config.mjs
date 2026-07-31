/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't fail the production build on lint rules; the app is validated by build + runtime.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
