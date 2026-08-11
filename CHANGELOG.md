# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

- **Added**
  - (placeholder)

- **Changed**
  - Bound npm publication to the exact prepared `main` commit after successful push-triggered CI.
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - Removed the npm write-token path, added a fail-closed npm 11.5.1-or-newer OIDC guard, and denied fork PR code access to self-hosted CI.
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
