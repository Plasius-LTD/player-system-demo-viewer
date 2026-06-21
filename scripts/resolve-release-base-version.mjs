import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?<build>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

function parseIdentifier(identifier) {
  return /^\d+$/u.test(identifier)
    ? { kind: "numeric", value: Number.parseInt(identifier, 10) }
    : { kind: "string", value: identifier };
}

export function normalizeVersionCandidate(candidate) {
  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return SEMVER_PATTERN.test(withoutPrefix) ? withoutPrefix : null;
}

function parseSemver(version) {
  const normalized = normalizeVersionCandidate(version);
  if (!normalized) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  const match = normalized.match(SEMVER_PATTERN);
  if (!match?.groups) {
    throw new Error(`Could not parse semantic version: ${version}`);
  }

  return {
    version: normalized,
    major: Number.parseInt(match.groups.major, 10),
    minor: Number.parseInt(match.groups.minor, 10),
    patch: Number.parseInt(match.groups.patch, 10),
    prerelease: (match.groups.prerelease ?? "").split(".").filter(Boolean).map(parseIdentifier),
  };
}

function comparePrerelease(left, right) {
  if (left.length === 0 && right.length === 0) {
    return 0;
  }

  if (left.length === 0) {
    return 1;
  }

  if (right.length === 0) {
    return -1;
  }

  const maxLength = Math.max(left.length, right.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];

    if (!leftIdentifier) {
      return -1;
    }

    if (!rightIdentifier) {
      return 1;
    }

    if (
      leftIdentifier.kind === "numeric" &&
      rightIdentifier.kind === "numeric" &&
      leftIdentifier.value !== rightIdentifier.value
    ) {
      return leftIdentifier.value > rightIdentifier.value ? 1 : -1;
    }

    if (leftIdentifier.kind !== rightIdentifier.kind) {
      return leftIdentifier.kind === "numeric" ? -1 : 1;
    }

    if (leftIdentifier.value !== rightIdentifier.value) {
      return leftIdentifier.value > rightIdentifier.value ? 1 : -1;
    }
  }

  return 0;
}

export function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);

  for (const field of ["major", "minor", "patch"]) {
    if (leftVersion[field] !== rightVersion[field]) {
      return leftVersion[field] > rightVersion[field] ? 1 : -1;
    }
  }

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}

export function selectHighestKnownReleaseVersion(candidates) {
  const normalized = candidates.map(normalizeVersionCandidate).filter((candidate) => candidate !== null);

  if (normalized.length === 0) {
    throw new Error("No valid semantic versions were provided.");
  }

  return normalized.reduce((highest, candidate) =>
    compareSemver(candidate, highest) > 0 ? candidate : highest,
  );
}

function runCli() {
  const stdin = readFileSync(0, "utf8");
  const versions = stdin.split(/\r?\n/u);
  const highest = selectHighestKnownReleaseVersion(versions);
  process.stdout.write(`${highest}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli();
}
