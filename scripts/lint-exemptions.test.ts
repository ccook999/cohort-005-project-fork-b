import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addedExemptions,
  exemptions,
  type OxlintConfig,
  parseJsonc,
} from "./lint-exemptions";

const config = (...overrides: OxlintConfig["overrides"] & object) => ({
  overrides,
});
const exempt = (files: string[], rule = "max-lines") => ({
  files,
  rules: { [rule]: "off" },
});

describe("parseJsonc", () => {
  it("drops comments and trailing commas, but not // inside strings", () => {
    const text = `{
      // a comment
      "url": "https://example.com", /* block */
      "list": ["app/routes/**",],
    }`;
    expect(parseJsonc(text)).toEqual({
      url: "https://example.com",
      list: ["app/routes/**"],
    });
  });

  it("keeps escaped quotes and comment markers inside strings", () => {
    expect(parseJsonc(String.raw`{"a": "say \"// hi\" /* x */"}`)).toEqual({
      a: 'say "// hi" /* x */',
    });
  });

  it("parses the repo's .oxlintrc.json", () => {
    const parsed = parseJsonc(
      readFileSync(".oxlintrc.json", "utf8")
    ) as OxlintConfig;
    expect(exemptions(parsed).size).toBeGreaterThan(0);
  });
});

describe("exemptions", () => {
  it("counts literal paths a rule is turned off for", () => {
    const pairs = exemptions(config(exempt(["a.ts"], "max-depth")));
    expect([...pairs]).toEqual(["max-depth\ta.ts"]);
  });

  it("ignores glob overrides", () => {
    expect(exemptions(config(exempt(["**/*.test.ts"]))).size).toBe(0);
  });

  it("ignores overrides that change a rule without turning it off", () => {
    const override = { files: ["a.ts"], rules: { "max-lines": "warn" } };
    expect(exemptions(config(override)).size).toBe(0);
  });

  it("treats 0 and an array starting with off as off", () => {
    const override = {
      files: ["a.ts"],
      rules: { one: 0, two: ["off", { max: 1 }] },
    };
    expect(exemptions(config(override)).size).toBe(2);
  });
});

describe("addedExemptions", () => {
  it("allows removing an exemption", () => {
    const before = config(exempt(["a.ts", "b.ts"]));
    expect(addedExemptions(before, config(exempt(["a.ts"])))).toEqual([]);
  });

  it("reports a file added to an exemption list", () => {
    const before = config(exempt(["a.ts"]));
    const after = config(exempt(["a.ts", "new.ts"]));
    expect(addedExemptions(before, after)).toEqual([
      { rule: "max-lines", file: "new.ts" },
    ]);
  });

  it("reports an existing file exempted from a new rule", () => {
    const before = config(exempt(["a.ts"], "max-lines"));
    const after = config(
      exempt(["a.ts"], "max-lines"),
      exempt(["a.ts"], "max-depth")
    );
    expect(addedExemptions(before, after)).toEqual([
      { rule: "max-depth", file: "a.ts" },
    ]);
  });
});
