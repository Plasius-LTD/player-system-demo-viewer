import { describe, expect, it } from "vitest";

import {
  compareSemver,
  selectHighestKnownReleaseVersion,
} from "../scripts/resolve-release-base-version.mjs";
import { promoteUnreleasedChangelog } from "../scripts/promote-unreleased-changelog.mjs";

describe("protected-main release scripts", () => {
  it("selects the highest semantic version across package, npm, and tag candidates", () => {
    expect(
      selectHighestKnownReleaseVersion([
        "0.1.0",
        "v0.1.2",
        "0.1.1-beta.1",
        "v0.1.3-rc.1",
      ])
    ).toBe("0.1.3-rc.1");
  });

  it("treats stable versions as newer than prereleases for the same base version", () => {
    expect(compareSemver("0.2.0", "0.2.0-rc.3")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0-beta.2", "0.2.0-beta.10")).toBeLessThan(0);
  });

  it("promotes the Unreleased changelog body into a versioned section and resets placeholders", () => {
    const content = `# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- add protected-main-safe release flow
- preserve reviewed release metadata
`;

    expect(
      promoteUnreleasedChangelog(content, {
        nextVersion: "0.1.3",
        date: "2026-06-21",
        repository: "",
      })
    ).toBe(`# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.3] - 2026-06-21

- add protected-main-safe release flow
- preserve reviewed release metadata
`);
  });

  it("updates footer links when changelog compare metadata exists", () => {
    const content = `# Changelog

## Unreleased
- document workflow

[Unreleased]: https://github.com/example-org/example-package/compare/v0.1.2...HEAD
`;

    expect(
      promoteUnreleasedChangelog(content, {
        nextVersion: "0.1.3",
        date: "2026-06-21",
        repository: "example-org/example-package",
      })
    ).toContain(
      `[Unreleased]: https://github.com/example-org/example-package/compare/v0.1.3...HEAD`
    );
    expect(
      promoteUnreleasedChangelog(content, {
        nextVersion: "0.1.3",
        date: "2026-06-21",
        repository: "example-org/example-package",
      })
    ).toContain(
      `[0.1.3]: https://github.com/example-org/example-package/releases/tag/v0.1.3`
    );
  });
});
