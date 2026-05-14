# TDR-0001: Player System Demo Viewer Bootstrap Scope

## Summary

Bootstrap the demo-viewer package with dual-module outputs, baseline CI,
scenario manifest helpers, docs, demo, tests, and the inherited feature flag
`isekai.player-system.packages.enabled`.

## Direction

The bootstrap should stop at package validation surfaces and scenario manifests, not a full browser host implementation.

The bootstrap must keep rollout control aligned with the package-family parent
flag instead of creating a separate demo-viewer-specific gate.
