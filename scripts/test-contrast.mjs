/**
 * WCAG AA contrast guard for the palette in src/app/globals.css.
 *
 * This file exists because the palette has already regressed twice — the pain
 * text on orange-soft sat at 2.8:1, and --color-muted at 2.47:1, both caught
 * by eye long after they shipped. A colour is a thing you can measure, so
 * measure it.
 *
 * Thresholds: 4.5:1 for normal text, 3:1 for large text (>=18.66px bold or
 * >=24px regular) and for UI components like a progress bar against its track.
 * The builder's labels are 11-13px bold, which is NOT large text — bold does
 * not change the threshold below 18.66px.
 *
 *   node scripts/test-contrast.mjs
 */
const HEX = {
  navy: "#232d4b", navySoft: "#edeff5",
  orange: "#e57200", orangeSoft: "#fdf1e5", orangeInk: "#a34f00",
  ink: "#232d4b", ink2: "#5c6478", muted: "#6e7688",
  line: "#e6e8ee", green: "#2f7d4f", greenSoft: "#eaf4ee",
  red: "#e5484d", redSoft: "#fdecec",
  teal: "#0f6f7a", tealSoft: "#e6f2f4",
  page: "#f7f8fa", white: "#ffffff",
};

const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = srgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** Flatten `color` at `alpha` over `bg`, the way the browser composites /70 etc. */
const over = (h, alpha, bg) => {
  const a = srgb(h), b = srgb(bg);
  const mix = a.map((c, i) => c * alpha + b[i] * (1 - alpha));
  return "#" + mix.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
};
const ratio = (fg, bg) => {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

let pass = 0, fail = 0;
function check(name, fg, bg, min = 4.5) {
  const r = ratio(fg, bg);
  if (r >= min) { pass++; }
  else { fail++; console.log(`FAIL ${name}: ${r.toFixed(2)}:1, needs ${min}:1`); }
}

// ---- the new teal, used for the mid-distance schedule --------------------
check("teal on white", HEX.teal, HEX.white);
check("teal on teal-soft", HEX.teal, HEX.tealSoft);
check("white on teal chip", HEX.white, HEX.teal);
check("teal echo on tealSoft/50 tint", HEX.teal, over(HEX.tealSoft, 0.5, HEX.white));

// ---- chips and bands ------------------------------------------------------
check("white on navy chip", HEX.white, HEX.navy);
check("white on orange-ink chip", HEX.white, HEX.orangeInk);
check("navy on navy-soft band", HEX.navy, HEX.navySoft);
check("navy/70 label on navy-soft", over(HEX.navy, 0.7, HEX.navySoft), HEX.navySoft);
check("navy header on navySoft/60", HEX.navy, over(HEX.navySoft, 0.6, HEX.white));

// ---- the readable-at-all-costs text --------------------------------------
check("orange-ink error on white", HEX.orangeInk, HEX.white);
check("orange-ink error on orange-soft", HEX.orangeInk, HEX.orangeSoft);
check("orange-ink on page", HEX.orangeInk, HEX.page);
check("ink on navySoft/60 empty box", HEX.ink, over(HEX.navySoft, 0.6, HEX.white));
check("ink-2 hint on white", HEX.ink2, HEX.white);
check("ink-2 hint on page", HEX.ink2, HEX.page);
check("ink-2 on page/60 banded row", HEX.ink2, over(HEX.page, 0.6, HEX.white));
check("ink on orangeSoft/60 moved row", HEX.ink, over(HEX.orangeSoft, 0.6, HEX.white));
check("green count on white", HEX.green, HEX.white);
check("white on muted disabled button", HEX.white, HEX.muted);

// ---- placeholders still have to be legible -------------------------------
check("placeholder ink-2 on navySoft/60", HEX.ink2, over(HEX.navySoft, 0.6, HEX.white));
check("placeholder ink-2 on tealSoft/70", HEX.ink2, over(HEX.tealSoft, 0.7, HEX.white));

// ---- non-text UI: 3:1 ----------------------------------------------------
check("progress fill vs track", HEX.orangeInk, HEX.navySoft, 3);
check("progress fill (done) vs track", HEX.green, HEX.navySoft, 3);
check("dashed empty border vs tint", over(HEX.navy, 0.5, HEX.navySoft), over(HEX.navySoft, 0.6, HEX.white), 3);

// ---- the one that was wrong, kept as a regression guard ------------------
// bg-orange with white text is only 3.14:1 — fine for a big fill, NOT for an
// 11px chip label. That is why the past-week chip uses orange-ink.
const bad = ratio(HEX.white, HEX.orange);
if (bad < 4.5) { pass++; } else { fail++; console.log("Expected white-on-orange to still be sub-AA; palette changed?"); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
