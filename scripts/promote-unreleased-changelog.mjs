import { readFile, writeFile } from "node:fs/promises";

const PLACEHOLDER_BODY = [
  "- **Added**",
  "  - (placeholder)",
  "",
  "- **Changed**",
  "  - (placeholder)",
  "",
  "- **Fixed**",
  "  - (placeholder)",
  "",
  "- **Security**",
  "  - (placeholder)",
].join("\n");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function updateFooterLinks(content, nextVersion, repository) {
  if (!repository) {
    return content;
  }

  const footerPattern = /^\[[^\]]+\]: .*/m;
  if (!footerPattern.test(content)) {
    return content;
  }

  const unreleasedLine = `[Unreleased]: https://github.com/${repository}/compare/v${nextVersion}...HEAD`;
  const releaseLine = `[${nextVersion}]: https://github.com/${repository}/releases/tag/v${nextVersion}`;

  let nextContent = content.replace(/^\[Unreleased\]: .*$/m, unreleasedLine);
  if (!new RegExp(`^\\[${escapeRegExp(nextVersion)}\\]:`, "m").test(nextContent)) {
    nextContent = `${nextContent.trimEnd()}\n${releaseLine}\n`;
  }

  return nextContent;
}

export function promoteUnreleasedChangelog(content, options) {
  const { nextVersion, date, repository } = options;
  const versionHeaderPattern = new RegExp(`^## \\[${escapeRegExp(nextVersion)}\\]`, "m");
  if (versionHeaderPattern.test(content)) {
    return content;
  }

  const unreleasedMatch = content.match(/^## (?:\[Unreleased\]|Unreleased)$/m);
  if (!unreleasedMatch || unreleasedMatch.index === undefined) {
    return content;
  }
  const unreleasedHeading = unreleasedMatch[0];

  const before = content.slice(0, unreleasedMatch.index);
  const afterHeading = content.slice(unreleasedMatch.index + unreleasedMatch[0].length);
  const afterHeadingWithoutLeadingNewline = afterHeading.replace(/^\n/, "");
  const nextHeadingMatch = afterHeadingWithoutLeadingNewline.match(/^## \[/m);
  const unreleasedBody = nextHeadingMatch
    ? afterHeadingWithoutLeadingNewline.slice(0, nextHeadingMatch.index)
    : afterHeadingWithoutLeadingNewline;
  const tail = nextHeadingMatch ? afterHeadingWithoutLeadingNewline.slice(nextHeadingMatch.index).trimStart() : "";

  const promotedBody = unreleasedBody.trim().length > 0 ? unreleasedBody.trimEnd() : "### Changed\n- (no notable changes)";

  const nextParts = [
    before.trimEnd(),
    "",
    unreleasedHeading,
    "",
    PLACEHOLDER_BODY,
    "",
    `## [${nextVersion}] - ${date}`,
    "",
    promotedBody.trimEnd(),
  ];

  if (tail) {
    nextParts.push("", tail);
  }

  let nextContent = nextParts.join("\n").replace(/\n{3,}/g, "\n\n");

  nextContent = `${nextContent.trimEnd()}\n`;
  return updateFooterLinks(nextContent, nextVersion, repository);
}

async function main() {
  const [filePath, nextVersion, repository = ""] = process.argv.slice(2);
  if (!filePath || !nextVersion) {
    console.error("Usage: node scripts/promote-unreleased-changelog.mjs <file> <version> [repository]");
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const content = await readFile(filePath, "utf8");
  const nextContent = promoteUnreleasedChangelog(content, {
    nextVersion,
    date,
    repository,
  });

  if (nextContent !== content) {
    await writeFile(filePath, nextContent, "utf8");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
