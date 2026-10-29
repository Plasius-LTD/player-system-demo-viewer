# ADR-0001: Player System Demo Viewer Package Boundary

## Status

Accepted

## Context

The Player System package family needs a static validation launcher and scenario surface that stays separate from production runtime hosting.

## Decision

`@plasius/player-system-demo-viewer` will own demo-scenario manifest contracts and the validation-launcher package boundary.

The package inherits the Player System package-family parent feature flag
`isekai.player-system.packages.enabled`. No capability is required at bootstrap
time because the repository defines reusable validation surfaces instead of
end-user entitlement or discoverability.

The demo-viewer boundary also owns the explicit portability contract behind
`isekai.player-system.runtime-portability.enabled`, including synthetic sample
persona rules and scaled composition evidence for runtime adoption.

### Standalone dependency qualification (Task #10)

The current static package has no imports from GPU interaction, lighting, or
renderer packages. Keep those unused dependencies absent rather than adding
registry versions solely to replace historical sibling paths. Required future
adapters must consume published packages; local `file:` or workspace links cannot
be part of this standalone repository's dependency graph. Tests inspect both
manifest declarations and every locked package resolution, and qualification
installs a fresh checkout outside the monorepo with `npm ci`.

The inherited portability flag stages host adoption through the host's stored
flag evaluator: enabled permits adoption after qualification; disabled or
unavailable retains the host's prior integration. Rollback persists disabled in
the governed flag store. Dependency integrity checks remain unconditional and
are never weakened by a rollout value. No new runtime evaluator, capability,
environment override, dependency, or GPU release prerequisite is introduced.
README, Unreleased notes, regression tests and the existing main/production CD
path carry this tooling clarification through an ordinary patch release.

## Consequences

- Demo validation can evolve without coupling to a full game runtime.
- Scenario coverage can be tracked as package-owned artifacts.
- Host apps are not forced to embed demo concerns.
- Rollback for early adoption remains centralized: disable
  `isekai.player-system.packages.enabled`.
- Privacy-safe sample data and scale evidence become reusable package outputs
  instead of ad hoc fixture conventions.
