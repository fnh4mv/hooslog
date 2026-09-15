/**
 * The one rule for reading a coach-typed mileage figure.
 *
 * There are two doors into a week now — the in-app week builder and the
 * spreadsheet importer — and a coach types the same things at both: a plain
 * number, a range ("55-60"), or a minimum ("60+"). Two parsers would drift,
 * and a drifted parser is how "12-13" became December. So the rule lives
 * here once and both doors call it, exactly like resolve_display_name in
 * migration 0013.
 *
 * What the importer keeps for itself is the part that is genuinely about
 * Excel: a cell whose value already arrived as a Date, because Excel
 * converted a range the moment it was typed. That can't happen to a string
 * from a text input, which is the entire point of the builder.
 *
 * A figure has two halves and they always travel together (locked 21/28):
 *   value — the tracked number the progress bar uses (a range tracks its
 *           middle, a minimum tracks its floor)
 *   label — what the coach wrote, shown as written; null for a plain number
 */

/** A 200-mile week would be a world record; anything above is a typo. */
export const MAX_GOAL = 200;
/** Nobody's "long run" is a marathon-and-a-half in training. */
export const MAX_LONG_RUN = 40;

export type MileageKind = "weekly goal" | "long run";

export type MileageValue = { value: number; label: string | null };

export type MileageResult =
  /** The field was empty. Not an error: blank means "leave this one alone". */
  | { ok: true; empty: true }
  | { ok: true; empty: false; value: number; label: string | null }
  | { ok: false; message: string };

const PLUS = /^(\d+(?:\.\d+)?)\s*\+$/;
const RANGE = /^(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)$/i;

export function maxFor(kind: MileageKind): number {
  return kind === "weekly goal" ? MAX_GOAL : MAX_LONG_RUN;
}

/**
 * Parse one typed figure. Never throws: a bad entry comes back as a message
 * written for the coach, not for a developer.
 */
export function parseMileageInput(raw: string, kind: MileageKind): MileageResult {
  const s = raw.trim();
  if (!s) return { ok: true, empty: true };

  const max = maxFor(kind);
  let value: number;
  let label: string | null = null;

  const plus = PLUS.exec(s);
  const range = RANGE.exec(s);

  if (plus) {
    // "60+" means at least sixty. Shown as written; the bar tracks the floor.
    value = Number(plus[1]);
    label = s;
  } else if (range) {
    // "45-49", "45 – 49", "45 to 49". Shown as written; the bar tracks the middle.
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    if (lo > hi) {
      return {
        ok: false,
        message: `"${s}" is backwards — put the smaller number first, like ${hi}-${lo}.`,
      };
    }
    value = (lo + hi) / 2;
    label = s;
  } else {
    value = Number(s);
  }

  if (!Number.isFinite(value)) {
    const examples =
      kind === "weekly goal"
        ? "like 70, a range like 45-49, or a minimum like 60+"
        : "like 14, a range like 14-16, or a minimum like 16+";
    return {
      ok: false,
      message: `"${s}" isn't a number. ${kind === "weekly goal" ? "Weekly goals" : "Long runs"} are miles — ${examples}.`,
    };
  }
  if (value <= 0 || value > max) {
    return {
      ok: false,
      message: `A ${kind} of ${value} miles isn't right — it should be between 1 and ${max}.`,
    };
  }

  return { ok: true, empty: false, value: Math.round(value * 10) / 10, label };
}

/**
 * Render a stored figure back into the box the coach types in, so that
 * loading a week and re-posting it unchanged is a no-op. The label is what
 * he wrote, so it wins; a plain number prints without a trailing ".0".
 */
export function formatMileageInput(
  value: number | null | undefined,
  label: string | null | undefined,
): string {
  if (label) return label;
  if (value === null || value === undefined) return "";
  return String(Math.round(value * 10) / 10);
}
