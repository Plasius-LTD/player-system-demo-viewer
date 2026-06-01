# TDR-0001: Player System Demo Viewer Bootstrap Scope

## Summary

Bootstrap the demo-viewer package with dual-module outputs, baseline CI,
scenario manifest helpers, docs, demo, tests, and the inherited feature flag
`isekai.player-system.packages.enabled`.

Feature `isekai.player-system.runtime-portability.enabled` extends that scope
with synthetic sample persona policy and scaled composition validation records.

## Direction

The bootstrap should stop at package validation surfaces and scenario manifests, not a full browser host implementation.

The bootstrap must keep rollout control aligned with the package-family parent
flag instead of creating a separate demo-viewer-specific gate.

Scaled demo evidence should remain package-owned metadata and must not depend on
real user identifiers or production account payloads.
