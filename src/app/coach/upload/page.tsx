import Link from "next/link";
import { mondayOf, trainingTodayET } from "@/lib/dates";
import { CoachHeader } from "../header";
import { Uploader } from "./uploader";

/** Plan upload (locked 23): fill the template, drop it here, check it, post it. */
export default function UploadPage() {
  const weekStart = mondayOf(trainingTodayET());

  return (
    <div className="min-h-screen">
      <CoachHeader
        weekStart={weekStart}
        isCurrentWeek
        hrefForWeek={(w) => (w ? `/coach?week=${w}` : "/coach")}
      />

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <div>
          <Link href="/coach" className="text-[12px] font-bold text-orange hover:underline">
            ‹ All athletes
          </Link>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy">Post a week</h1>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">
            Fill in the template — the Monday date, each day&apos;s workout, and every
            athlete&apos;s mileage goal — then drop it here. You&apos;ll see exactly what it
            says before anything posts.
          </p>
        </div>

        <Uploader />
      </main>
    </div>
  );
}
