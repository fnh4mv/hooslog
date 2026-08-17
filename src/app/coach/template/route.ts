import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireCoach } from "@/lib/coach-auth";

/**
 * Serves the committed week-plan template.
 *
 * Read from docs/templates rather than copied into public/ on purpose: that
 * file is the format contract the parser is written against (locked 23), and
 * two copies is how a coach ends up downloading a template the importer no
 * longer accepts. next.config.ts traces it into the deployed bundle.
 *
 * The role check is here rather than inherited: route handlers don't run
 * through coach/layout.tsx, so without this any signed-in athlete could pull
 * it. Middleware only proves you're signed in.
 */
export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return new Response(auth.error, { status: 403 });

  const file = path.join(
    process.cwd(),
    "docs",
    "templates",
    "hooslog_week_plan_template.xlsx",
  );

  try {
    const buf = await readFile(file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="hooslog_week_plan_template.xlsx"',
        // private: the response is behind a coach role check — a shared cache
        // (CDN/proxy) must never replay it to someone the check never saw.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Template file is missing from this deployment.", {
      status: 500,
    });
  }
}
