/** @type {import('next').NextConfig} */
const nextConfig = {
  // while developing, the Python reconciliation engine runs separately (npm run recon:dev);
  // on Vercel api/recon.py is served at the same address
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/api/recon", destination: "http://127.0.0.1:5000/api/recon" }]
      : []
  },

  // basic protections for every response
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
