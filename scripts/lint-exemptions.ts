// The per-file lint exemptions in .oxlintrc.json: every (file, rule) pair
// where an override turns a rule off for a literal path. Glob overrides
// ("**/*.test.ts") are policy, not exemptions, so they are left out.
// Used by scripts/check-lint-exemptions.ts.

const GLOB = /[*?[\]{}]/;

type Override = { files?: string[]; rules?: Record<string, unknown> };
export type OxlintConfig = { overrides?: Override[] };

const isOff = (setting: unknown): boolean =>
  setting === "off" ||
  setting === 0 ||
  (Array.isArray(setting) && isOff(setting[0]));

// The index of the quote that closes the string opening at `start`.
function stringEnd(text: string, start: number) {
  let i = start + 1;
  while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i;
}

// .oxlintrc.json is JSONC: drop comments and trailing commas outside strings.
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const end = stringEnd(text, i);
      out += text.slice(i, end + 1);
      i = end;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else {
      out += char;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function exemptions(config: OxlintConfig) {
  const pairs = new Set<string>();
  for (const override of config.overrides ?? []) {
    const offRules = Object.entries(override.rules ?? {})
      .filter(([, setting]) => isOff(setting))
      .map(([rule]) => rule);
    for (const file of override.files ?? []) {
      if (GLOB.test(file)) continue;
      for (const rule of offRules) pairs.add(`${rule}\t${file}`);
    }
  }
  return pairs;
}

export function addedExemptions(before: OxlintConfig, after: OxlintConfig) {
  const old = exemptions(before);
  return [...exemptions(after)]
    .filter((pair) => !old.has(pair))
    .map((pair) => {
      const [rule, file] = pair.split("\t");
      return { rule, file };
    });
}
