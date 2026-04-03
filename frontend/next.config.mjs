/** @type {import('next').NextConfig} */
const staticBaseUrl = (process.env.NEXT_PUBLIC_CDN_STATIC_BASE_URL || "").trim().replace(/\/+$/, "");

const nextConfig = {
  ...(process.env.NODE_ENV === "production" && staticBaseUrl
    ? {
        assetPrefix: staticBaseUrl,
      }
    : {}),
};

export default nextConfig;
