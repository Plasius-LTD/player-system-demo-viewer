# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Changed
- Refresh compatible npm dependencies from the registry for the weekly dependency maintenance wave.


- **Added**
  - (placeholder)

- **Changed**
  - Bound npm publication to the exact prepared `main` commit after successful push-triggered CI.
  - (placeholder)

- **Fixed**
  - Added exact-commit CI dispatch and disabled package-manager cache finalization in both hosted validation jobs.
  - (placeholder)

- **Security**
  - Updated Vitest and its coverage adapter to 4.1.11, clearing the redirect-mock path traversal advisory.
  - Removed the npm write-token path, added a fail-closed npm 11.5.1-or-newer OIDC guard, and denied fork PR code access to reviewed CI.
  - Pinned patched transitive npm dependencies to clear the current audit baseline.
  - Moved reviewed CI to explicit GitHub-hosted runners while retaining the same-repository pull-request guard.
  - Added fail-closed source and npm-package admission for the administrative contributor registry and pinned the CI/CD runtime to Node.js 24.18.0 LTS.
  - Pinned patched transitive build-tool dependencies for the current npm audit advisories.
  - (placeholder)

## [0.1.5] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.4] - 2026-06-22

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [0.1.3] - 2026-06-21

- bootstrap `@plasius/player-system-demo-viewer` from the schema package baseline with package governance, docs, tests, and demo scaffolding
- add demo performance, stability, and degraded-path validation contracts under `isekai.player-system.runtime-nfr.enabled`
- align bootstrap rollout documentation and exports on parent feature flag `isekai.player-system.packages.enabled`
- add privacy-safe sample persona and scaled composition contracts under `isekai.player-system.runtime-portability.enabled`
- add a static scenario catalog for awakening, mission guidance, focused panes, combat-safe tutorial reduction, institution routing, and points-ledger validation
- switch npm publication to a protected-main-safe release-prep PR plus publish-from-main workflow
[0.1.4]: https://github.com/Plasius-LTD/player-system-demo-viewer/releases/tag/v0.1.4
[0.1.5]: https://github.com/Plasius-LTD/player-system-demo-viewer/releases/tag/v0.1.5
