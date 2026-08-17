"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { commitUpload, previewUpload, type UploadPreview } from "./actions";
import type { ImportError } from "@/lib/importer";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function prettyWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

/**
 * Upload → preview → confirm (docs/12 Phase 4). Nothing is written until the
 * coach has seen the parsed week, so a wrong file is caught by reading, not by
 * undoing. The File itself is held here and re-sent on confirm: the write is
 * always based on what the server parses, never on JSON from this component.
 */
export function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [errors, setErrors] = useState<ImportError[]>([]);
  const [done, setDone] = useState<{ weekStartISO: string; goalsSet: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setPreview(null);
    setErrors([]);
    setDone(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function choose(next: File | null) {
    setErrors([]);
    setPreview(null);
    setDone(null);
    setFile(next);
    if (!next) return;

    const fd = new FormData();
    fd.set("file", next);
    startTransition(async () => {
      const res = await previewUpload(fd);
      if (!res.ok) setErrors(res.errors);
      else setPreview(res.preview);
    });
  }

  function confirm() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    setErrors([]);
    startTransition(async () => {
      const res = await commitUpload(fd);
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setPreview(null);
      setDone({ weekStartISO: res.weekStartISO, goalsSet: res.goalsSet });
      router.refresh();
    });
  }

  // ---- after a successful write ----
  if (done) {
    return (
      <section className="rounded-2xl border border-green bg-green-soft p-6 text-center">
        <div className="text-lg font-extrabold text-green">Week posted ✓</div>
        <p className="mt-1 text-[14px] font-semibold text-ink">
          {prettyWeek(done.weekStartISO)} — {done.goalsSet}{" "}
          {done.goalsSet === 1 ? "goal" : "goals"} set. Athletes see it now.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link
            href={`/coach?week=${done.weekStartISO}`}
            className="rounded-xl bg-navy px-4 py-2.5 text-[13px] font-bold text-white"
          >
            See the team grid
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl border-[1.5px] border-line bg-white px-4 py-2.5 text-[13px] font-bold text-navy"
          >
            Upload another week
          </button>
        </div>
      </section>
    );
  }

  const unmatched = preview?.goals.filter((g) => !g.matchedName) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* ---- drop zone ---- */}
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`rounded-2xl border-[1.5px] border-dashed bg-white p-8 text-center transition-colors ${
          dragging ? "border-orange bg-orange-soft" : "border-[#C9CDD8]"
        }`}
      >
        <div className="text-[15px] font-bold text-navy">
          {file ? file.name : "Drop the filled-in template here"}
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {file ? "Checking it over…" : ".xlsx from the HoosLog template"}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-xl bg-navy px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
          >
            {busy ? "Reading…" : file ? "Pick a different file" : "Choose file"}
          </button>
          <a
            href="/coach/template"
            className="rounded-xl border-[1.5px] border-line bg-white px-4 py-2.5 text-[13px] font-bold text-navy"
          >
            Download the template
          </a>
        </div>
      </section>

      {/* ---- what's wrong with it ---- */}
      {errors.length > 0 && (
        <section className="rounded-2xl border border-orange bg-orange-soft p-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange">
            {errors.length === 1 ? "Fix this, then upload again" : `${errors.length} things to fix`}
          </div>
          <ul className="mt-2 flex flex-col gap-2">
            {errors.map((e, i) => (
              <li key={i} className="text-[13px] leading-snug text-ink">
                <span className="font-bold text-navy">{e.where}</span>
                <span className="mx-1 text-muted">·</span>
                {e.message}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] font-semibold text-ink-2">Nothing was saved.</p>
        </section>
      )}

      {/* ---- preview ---- */}
      {preview && (
        <>
          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Week of
                </div>
                <div className="text-lg font-extrabold text-navy">
                  {prettyWeek(preview.weekStartISO)}
                </div>
              </div>
              {preview.replacesExistingPlan && (
                <span className="rounded-lg bg-orange-soft px-2.5 py-1 text-[12px] font-bold text-orange">
                  Replaces the plan already posted for this week
                </span>
              )}
            </div>

            <ul className="mt-3 divide-y divide-line border-t border-line">
              {preview.plans.map((p, i) => (
                <li key={i} className="flex gap-3 py-2">
                  <span className="w-[86px] flex-none text-[12px] font-bold uppercase tracking-wider text-muted">
                    {DAYS[i]}
                  </span>
                  <span
                    className={`text-[13px] leading-snug ${
                      p ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    {p || "no plan"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Mileage goals — {preview.goals.length}{" "}
              {preview.goals.length === 1 ? "athlete" : "athletes"}
            </div>

            {preview.goals.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">
                No goals in this file. The plan posts; nobody gets a target.
              </p>
            ) : (
              <table className="mt-2 w-full border-collapse">
                <tbody>
                  {preview.goals.map((g) => (
                    <tr key={g.email} className="border-t border-line">
                      <td className="py-2 pr-2">
                        <div className="text-[13px] font-bold text-navy">
                          {g.matchedName?.trim() || g.name || g.email}
                        </div>
                        <div className="text-[11px] text-muted">{g.email}</div>
                      </td>
                      <td className="py-2 text-right">
                        {g.matchedName === null ? (
                          <span className="text-[12px] font-bold text-orange">
                            no account — row {g.row}
                          </span>
                        ) : (
                          <span className="text-[14px] font-extrabold text-navy">
                            {g.goal}
                            <span className="ml-0.5 text-[11px] font-bold text-muted">mi</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {preview.missingFromFile.length > 0 && (
              <p className="mt-3 text-[12px] leading-snug text-ink-2">
                <b className="text-navy">Not in this file:</b>{" "}
                {preview.missingFromFile.join(", ")} — they keep whatever goal they already had.
              </p>
            )}
          </section>

          {preview.warnings.length > 0 && (
            <section className="rounded-2xl border border-line bg-white p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Worth a look
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-[13px] leading-snug text-ink-2">
                    <span className="font-bold text-navy">{w.where}</span>
                    <span className="mx-1 text-muted">·</span>
                    {w.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {unmatched.length > 0 ? (
            <section className="rounded-2xl border border-orange bg-orange-soft p-4">
              <p className="text-[13px] font-semibold leading-snug text-ink">
                {unmatched.length === 1
                  ? "One email doesn't match an athlete account"
                  : `${unmatched.length} emails don't match an athlete account`}
                , so this can&apos;t post yet. Either fix the spelling in the Goals tab, or wait
                until they&apos;ve signed up — then upload again.
              </p>
            </section>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="flex-1 rounded-xl bg-navy py-3 text-[14px] font-bold text-white shadow-md disabled:opacity-60"
              >
                {busy ? "Posting…" : "Post this week"}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={busy}
                className="rounded-xl border-[1.5px] border-line bg-white px-5 py-3 text-[14px] font-bold text-ink-2 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
