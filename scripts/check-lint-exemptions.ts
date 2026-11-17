// Fails when .oxlintrc.json exempts a file from a rule that HEAD did not
// exempt it from. The exemption lists only shrink: each entry is a file that
// broke a rule before the rule existed, waiting to be fixed.
// Usage: tsx scripts/check-lint-exemptions.ts [--staged]
//   --staged  check the staged .oxlintrc.json (the pre-commit hook uses this)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  addedExemptions,
  type OxlintConfig,
  parseJsonc,
} from "./lint-exemptions";

const CONFIG = ".oxlintrc.json";

const git = (...args: string[]) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

function read(ref: string): OxlintConfig | null {
  try {
    return parseJsonc(git("show", `${ref}:${CONFIG}`)) as OxlintConfig;
  } catch {
    return null;
  }
}

const before = read("HEAD");
const after = process.argv.includes("--staged")
  ? read("")
  : (parseJsonc(readFileSync(CONFIG, "utf8")) as OxlintConfig);

const added = before && after ? addedExemptions(before, after) : [];

if (added.length > 0) {
  console.error(`${CONFIG} adds lint exemptions:\n`);
  for (const { rule, file } of added) console.error(`  ${rule}: ${file}`);
  console.error(`
The exemption lists only shrink. Fix the code so the rule passes. When code
moved out of an exempt file still breaks the rule (a split forced by the
token check), put the exemption on the line instead of the whole new file:

  // oxlint-disable-next-line max-lines-per-function -- moved from <old file>
  export function LongComponent() {`);
  process.exit(1);
}
