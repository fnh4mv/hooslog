"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { commitUpload, previewUpload, type UploadPreview } from "./actions";
import { GROUP_LABELS, GROUP_SHORT } from "@/lib/types";
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
  const [done, setDone] = useState<{
    weekStartISO: string;
    goalsSet: number;
    skippedEmails: string[];
    movedToMid: number;
    movedToDistance: number;
  } | null>(null);
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
      let res: Awaited<ReturnType<typeof previewUpload>>;
      try {
        res = await previewUpload(fd);
      } catch {
        res = { ok: false, errors: [{ where: "Upload", message: "Couldn't send the file — check your connection and pick it again." }] };
      }
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
      let res: Awaited<ReturnType<typeof commitUpload>>;
      try {
        res = await commitUpload(fd);
      } catch {
        // Includes Chrome's ERR_UPLOAD_FILE_CHANGED — the coach re-saved the
        // xlsx on disk between preview and confirm, so the held File is stale.
        res = { ok: false, errors: [{ where: "Upload", message: "Couldn't re-send the file (did it change on disk?). Nothing was saved — pick the file again and re-post." }] };
      }
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setPreview(null);
      setDone({
        weekStartISO: res.weekStartISO,
        goalsSet: res.goalsSet,
        skippedEmails: res.skippedEmails,
        movedToMid: res.movedToMid,
        movedToDistance: res.movedToDistance,
      });
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
        {done.movedToMid + done.movedToDistance > 0 && (
          <p className="mt-1 text-[13px] font-semibold text-ink-2">
            {[
              done.movedToMid > 0 && `${done.movedToMid} moved to mid-distance`,
              done.movedToDistance > 0 && `${done.movedToDistance} moved to distance`,
            ]
              .filter(Boolean)
              .join(" · ")}
            .
          </p>
        )}
        {done.skippedEmails.length > 0 && (
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-snug text-ink-2">
            <b className="text-navy">No goal set</b> for{" "}
            {done.skippedEmails.join(", ")} — no account with that email yet.
            Once they sign up, re-upload this same file to give them their
            target.
          </p>
        )}
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
          {busy
            ? "Checking it over…"
            : file
              ? errors.length > 0
                ? "That one needs fixes — see below"
                : "Parsed — review it below"
              : ".xlsx from the HoosLog template"}
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

            {/* Both schedules side by side, in the same shape as the file —
                so a coach who pasted the mid-D week into the distance column
                sees it here rather than on Monday morning. */}
            <table className="mt-3 w-full border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-[86px] py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-muted" />
                  <th className="py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-navy">
                    {GROUP_LABELS.distance}
                  </th>
                  <th className="py-1.5 pl-3 text-left text-[11px] font-bold uppercase tracking-wider text-navy">
                    {GROUP_LABELS.mid}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {DAYS.map((day, i) => (
                  <tr key={day}>
                    <td className="py-2 align-top text-[12px] font-bold uppercase tracking-wider text-muted">
                      {day}
                    </td>
                    <td
                      className={`py-2 pr-3 align-top text-[13px] leading-snug ${
                        preview.plansDistance[i] ? "font-semibold text-ink" : "text-muted"
                      }`}
                    >
                      {preview.plansDistance[i] || "no plan"}
                    </td>
                    <td
                      className={`py-2 pl-3 align-top text-[13px] leading-snug ${
                        preview.plansMid[i] ? "font-semibold text-ink" : "text-muted"
                      }`}
                    >
                      {preview.plansMid[i] || "no plan"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                        ) : g.goal === null ? (
                          <span className="text-[12px] font-semibold text-muted">
                            no mileage
                          </span>
                        ) : (
                          <span className="text-[14px] font-extrabold text-navy">
                            {g.label ?? g.goal}
                            <span className="ml-0.5 text-[11px] font-bold text-muted">mi</span>
                          </span>
                        )}
                      </td>
                      <td className="w-[92px] py-2 pl-2 text-right">
                        {(() => {
                          // What this athlete will be running after the post:
                          // the file's group if it names one, otherwise
                          // whatever they already are.
                          const grp = g.group ?? g.currentGroup;
                          if (!grp) return null;
                          const moving = g.group !== null && g.currentGroup !== null && g.group !== g.currentGroup;
                          return (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                                moving
                                  ? "bg-orange-soft text-orange ring-1 ring-orange/40"
                                  : grp === "mid"
                                    ? "bg-navy-soft text-navy"
                                    : "text-muted"
                              }`}
                              title={moving ? "Moving squad with this upload" : undefined}
                            >
                              {GROUP_SHORT[grp]}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {preview.missingFromFile.length > 0 && (
              <p className="mt-3 text-[12px] leading-snug text-ink-2">
                <b className="text-navy">Not in this file:</b>{" "}
                {preview.missingFromFile.join(", ")} — they get no goal for this
                week (unless one was already set for it).
              </p>
            )}

            <p className="mt-3 border-t border-line pt-3 text-[12px] font-semibold text-ink-2">
              After this posts:{" "}
              <b className="text-navy">{preview.squadCounts.distance}</b> on
              distance, <b className="text-navy">{preview.squadCounts.mid}</b> on
              mid-distance.
            </p>
          </section>

          {/* A mistyped GROUP cell is otherwise invisible until someone runs
              the wrong workout for a week. Anyone changing squad is named
              here, in orange, above the Post button. */}
          {preview.moves.length > 0 && (
            <section className="rounded-2xl border border-orange bg-orange-soft p-4">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-orange">
                {preview.moves.length === 1
                  ? "1 athlete changes schedule"
                  : `${preview.moves.length} athletes change schedule`}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {preview.moves.map((m) => (
                  <li key={m.name} className="text-[13px] font-semibold leading-snug text-ink">
                    {m.name}
                    <span className="mx-1.5 text-muted">·</span>
                    <span className="text-muted">{GROUP_LABELS[m.from]}</span>
                    <span className="mx-1.5 font-bold text-orange">→</span>
                    <span className="font-extrabold text-navy">{GROUP_LABELS[m.to]}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] leading-snug text-ink-2">
                This sticks — they stay there every week until you change the
                GROUP cell back. If that isn&apos;t right, fix the Goals tab and
                re-upload.
              </p>
            </section>
          )}

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

          {/* Unmatched emails no longer block the week: during onboarding
              most weeks have someone who hasn't signed up yet, and holding
              the workouts hostage helps nobody. The plan and every matched
              goal post; the skipped names are shown here AND on the done
              screen — visible, never silent. */}
          {unmatched.length > 0 && (
            <section className="rounded-2xl border border-orange bg-orange-soft p-4">
              <p className="text-[13px] font-semibold leading-snug text-ink">
                {unmatched.length === 1
                  ? "One email doesn't match an athlete account"
                  : `${unmatched.length} emails don't match an athlete account`}{" "}
                (marked above). The plan and the other goals still post —{" "}
                {unmatched.length === 1 ? "that athlete" : "those athletes"} just
                won&apos;t get a mileage target. If it&apos;s a typo, fix the Goals tab and
                re-upload; if they haven&apos;t signed up yet, re-upload this same
                file once they have.
              </p>
            </section>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 rounded-xl bg-navy py-3 text-[14px] font-bold text-white shadow-md disabled:opacity-60"
            >
              {busy
                ? "Posting…"
                : unmatched.length > 0
                  ? `Post this week (${unmatched.length} without a goal)`
                  : "Post this week"}
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
        </>
      )}
    </div>
  );
}
