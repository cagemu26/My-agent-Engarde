function resolveStaticBaseUrl() {
  const raw = (process.env.NEXT_PUBLIC_CDN_STATIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw) {
    return "";
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_CDN_STATIC_BASE_URL must be an absolute URL, for example https://static.example.com",
    );
  }

  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("NEXT_PUBLIC_CDN_STATIC_BASE_URL must use http or https");
  }

  return parsed.toString().replace(/\/+$/, "");
}

/** @type {import('next').NextConfig} */
const staticBaseUrl = resolveStaticBaseUrl();
const staticCdnEnabled = process.env.NODE_ENV === "production" && Boolean(staticBaseUrl);

if (staticCdnEnabled) {
  console.warn(
    `[cdn] assetPrefix enabled for Next static assets: ${staticBaseUrl}. ` +
      "Verify the CDN/static domain returns Access-Control-Allow-Origin for fonts and purge CDN cache after deploy.",
  );
}

const nextConfig = {
  ...(staticCdnEnabled
    ? {
        assetPrefix: staticBaseUrl,
        crossOrigin: "anonymous",
      }
    : {}),
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" },
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
