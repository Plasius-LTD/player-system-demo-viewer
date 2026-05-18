# ADR-0001: Player System Demo Viewer Package Boundary

## Status

Accepted

## Context

The Player System package family needs a static validation launcher and scenario surface that stays separate from production runtime hosting.

## Decision

`@plasius/player-system-demo-viewer` will own demo-scenario manifest contracts and the validation-launcher package boundary.

## Consequences

- Demo validation can evolve without coupling to a full game runtime.
- Scenario coverage can be tracked as package-owned artifacts.
- Host apps are not forced to embed demo concerns.
