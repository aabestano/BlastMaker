/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["mjml", "mjml-core", "@google/genai", "resend"],
  },
};

export default nextConfig;
