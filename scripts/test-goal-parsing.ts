/* One-off harness: run the real parser against the goal-cases fixture.
   Run: npx -y tsx scripts/test-goal-parsing.ts <fixture.xlsx> */
import { readFileSync } from "node:fs";
import { parseTemplate } from "../src/lib/importer";

async function main() {
  const buf = readFileSync(process.argv[2]);
  const res = await parseTemplate(buf);
  if (!res.ok) {
    console.log("ERRORS:");
    for (const e of res.errors) console.log(` [${e.where}] ${e.message}`);
    return;
  }
  console.log("ok — goals parsed:");
  for (const g of res.data.goals) console.log(` row ${g.row}: ${g.name} -> ${g.goal}`);
  console.log("warnings:");
  for (const w of res.data.warnings) console.log(` [${w.where}] ${w.message}`);
}
main();
