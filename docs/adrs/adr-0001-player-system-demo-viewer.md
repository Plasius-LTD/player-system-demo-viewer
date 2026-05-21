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

## Consequences

- Demo validation can evolve without coupling to a full game runtime.
- Scenario coverage can be tracked as package-owned artifacts.
- Host apps are not forced to embed demo concerns.
- Rollback for early adoption remains centralized: disable
  `isekai.player-system.packages.enabled`.
- Privacy-safe sample data and scale evidence become reusable package outputs
  instead of ad hoc fixture conventions.
