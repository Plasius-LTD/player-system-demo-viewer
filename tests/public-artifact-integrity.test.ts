import { readFileSync } from "node:fs";
import * as path from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(path.resolve("scripts/verify-public-artifacts.cjs"), "utf8");

// Supply path metadata only. Any attempt to read a contributor record fails.
function runGate(options: {
  treeNames?: string[];
  indexPaths?: string[];
  manifestPaths?: string[];
  argv?: string[];
  legalSymlink?: boolean;
} = {}) {
  const calls: string[] = [];
  const errors: string[] = [];
  const output: string[] = [];
  const processDouble = {
    argv: ["node", "verify-public-artifacts.cjs", ...(options.argv ?? ["--package-dir", "."])],
    cwd: () => "/fixture",
    exitCode: 0,
  };
  const fsDouble = {
    lstatSync: (file: string) => ({
      isSymbolicLink: () => file.endsWith("/legal") && Boolean(options.legalSymlink),
      isDirectory: () => file.endsWith("/legal"),
      isFile: () => file.endsWith("/package.json"),
    }),
    readdirSync: () => (options.treeNames ?? []).map((name) => ({ name })),
    readFileSync: () => { throw new Error("Content reads are forbidden"); },
  };
  const childProcessDouble = {
    spawnSync: (command: string) => {
      calls.push(command);
      if (command === "git") {
        return { status: 0, stdout: (options.indexPaths ?? []).join("\0"), stderr: "" };
      }
      if (command === "npm") {
        return {
          status: 0,
          stdout: JSON.stringify([{ files: (options.manifestPaths ?? ["dist/index.js"])
            .map((filePath) => ({ path: filePath })) }]),
          stderr: "",
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    },
  };
  runInNewContext(source, {
    require: (name: string) => {
      if (name === "node:fs") return fsDouble;
      if (name === "node:path") return path;
      if (name === "node:child_process") return childProcessDouble;
      throw new Error(`Unexpected module: ${name}`);
    },
    process: processDouble,
    console: { error: (value: string) => errors.push(value), log: (value: string) => output.push(value) },
  }, { timeout: 1000 });
  return { exitCode: processDouble.exitCode, calls, errors, output };
}

describe("public artifact admission using path metadata", () => {
  it.each(["cla-registry.csv", "CLA-REGISTRY.CSV", "ｃｌａ－ｒｅｇｉｓｔｒｙ．ｃｓｖ"])(
    "rejects current-tree record %s before invoking npm", (name) => {
      const result = runGate({ treeNames: [name] });
      expect(result.exitCode).toBe(1);
      expect(result.errors.join(" ")).toContain("Source contains prohibited path metadata");
      expect(result.calls).not.toContain("npm");
      expect(result.errors.join(" ")).not.toContain("Content reads are forbidden");
    },
  );

  it("rejects a staged record even when absent from the worktree", () => {
    const result = runGate({ indexPaths: ["legal/CLA-REGISTRY.CSV"] });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual(["git"]);
    expect(result.errors.join(" ")).toContain("Source contains prohibited path metadata");
  });

  it.each([
    "legal/cla-registry.csv",
    "./legal/CLA-REGISTRY.CSV",
    "package/legal/cla-registry.csv",
    "legal\\cla-registry.csv",
    "legal/unused/../cla-registry.csv",
    "legal/ｃｌａ－ｒｅｇｉｓｔｒｙ．ｃｓｖ",
  ])("rejects normalized final manifest path %s", (filePath) => {
    const result = runGate({ manifestPaths: ["dist/index.js", filePath] });
    expect(result.exitCode).toBe(1);
    expect(result.errors.join(" ")).toContain("npm package inventory contains prohibited path metadata");
  });

  it("admits ordinary CLA guidance and clean build output without reading record contents", () => {
    const result = runGate({
      treeNames: ["INDIVIDUAL_CLA.md", "CORPORATE_CLA.md"],
      manifestPaths: ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "README.md"],
    });
    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.calls).toEqual(["git", "npm"]);
    expect(result.output.join(" ")).toContain("contents of the prohibited path were not read");
  });

  it("rejects a symlinked administrative directory without following it", () => {
    const result = runGate({ legalSymlink: true });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.errors.join(" ")).toContain("refusing to follow it");
  });

  it("rejects an escaping package directory before invoking npm", () => {
    const result = runGate({ argv: ["--package-dir", "../outside"] });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual(["git"]);
    expect(result.errors.join(" ")).toContain("escapes repository root");
  });
});
