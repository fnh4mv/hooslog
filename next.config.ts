import type { NextConfig } from "next";

/**
 * Security headers. The app carries athletes' injury reporting, so it should
 * not be framable, should not leak URLs to third parties via Referer, and
 * should be HTTPS-pinned. CSP is deliberately not locked down to nonces yet —
 * Next injects inline bootstrap scripts, and a broken CSP mid-trial is worse
 * than a permissive one; frame-ancestors is the part that actually matters
 * here and it is enforced.
 */
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // The week-plan template is served from docs/templates by /coach/template —
  // it's the importer's format contract, so it stays in one place instead of
  // being duplicated into public/. Tracing puts it in the deployed bundle.
  outputFileTracingIncludes: {
    "/coach/template": ["./docs/templates/hooslog_week_plan_template.xlsx"],
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
