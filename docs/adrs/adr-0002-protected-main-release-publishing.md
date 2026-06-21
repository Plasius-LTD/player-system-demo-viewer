# ADR-0002: Protected-Main Release Publishing

## Status

Accepted

## Context

`@plasius/player-system-demo-viewer` publishes from a repository where `main`
is protected against direct workflow pushes. The original `cd.yml` tried to run
`npm version ...` inside the publish workflow and then `git push --follow-tags`
back to `main`, which fails with `GH006` before any npm publication can happen.

The repository still needs a repeatable release path that:

- keeps version and changelog changes reviewable through pull requests
- publishes only from the vetted `main` branch state
- creates the release tag and GitHub release from the same commit that is
  published to npm

## Decision

The release path will use a two-step protected-main-safe model:

1. A workflow-dispatch release-prep job creates a release branch and PR that
   updates `package.json`, `package-lock.json`, and promotes `CHANGELOG.md`
   `Unreleased` entries into the target version section.
2. After that PR merges to `main`, the push-triggered publish job validates the
   versioned `main` commit, creates the matching Git tag and GitHub release
   draft if needed, publishes to npm, and then publishes the GitHub release.

Manual `workflow_dispatch` runs with `bump=none` are reserved for rerunning the
publish job from an already-versioned `main` commit without generating another
release-prep PR.

## Consequences

- Release metadata changes remain policy-compliant under protected `main`.
- npm publication is tied to reviewed `main` state instead of an ephemeral
  workflow commit.
- Failed publish attempts can be retried with `bump=none` without mutating repo
  history.
- Maintainers must merge a release-prep PR before a new version can publish.
