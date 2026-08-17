import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The week-plan template is served from docs/templates by /coach/template —
  // it's the importer's format contract, so it stays in one place instead of
  // being duplicated into public/. Tracing puts it in the deployed bundle.
  outputFileTracingIncludes: {
    "/coach/template": ["./docs/templates/hooslog_week_plan_template.xlsx"],
  },
};

export default nextConfig;
