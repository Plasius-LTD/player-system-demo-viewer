import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type DependencyGroups = Partial<Record<
  "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies",
  Record<string, string>
>>;

const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as DependencyGroups;
const lock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8")) as {
  packages: Record<string, DependencyGroups & {
    resolved?: string;
    integrity?: string;
    link?: boolean;
  }>;
};
const groups = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;

describe("standalone dependency installation", () => {
  it("declares registry versions in the manifest and lock root", () => {
    for (const metadata of [manifest, lock.packages[""]]) {
      for (const group of groups) {
        for (const [name, version] of Object.entries(metadata?.[group] ?? {})) {
          expect(version, `${group}.${name} must use a registry version`)
            .toMatch(/^(?:[~^<>=*\d]|npm:)/u);
        }
      }
    }
  });

  it("locks every installed package to an integrity-checked registry tarball", () => {
    const installed = Object.entries(lock.packages).filter(([path]) => path !== "");
    expect(installed.length).toBeGreaterThan(0);
    for (const [path, entry] of installed) {
      expect(path, "lock entries must stay inside node_modules").toMatch(/^node_modules\//u);
      expect(entry.link, `${path} must not depend on a sibling checkout`).not.toBe(true);
      expect(entry.resolved, `${path} must resolve from the registry`)
        .toMatch(/^https:\/\/registry\.npmjs\.org\//u);
      expect(entry.integrity, `${path} must have registry integrity`).toMatch(/^sha(?:512|256|1)-\S+$/u);
    }
  });

  it("keeps root dependency declarations synchronized with the frozen lock", () => {
    for (const group of groups) {
      expect(lock.packages[""]?.[group] ?? {}).toEqual(manifest[group] ?? {});
    }
  });
});
