# Player System Demo Viewer Bootstrap

## Goal

Provide a package-standard bootstrap for Player System demo validation.

## Initial Surface

- package descriptor and feature-flag metadata
- scenario manifest contracts
- explicit static scenario catalog for awakening, mission guidance, focused panes,
  tutorial reduction, institution routing, and points-ledger validation
- demo manifest helper
- privacy-safe sample scenario catalog and portability validation helper
- demo and test scaffolding

## Exclusions

- production gameplay runtime
- renderer ownership
- orchestration authority

## Portability Notes

- Sample personas must stay synthetic-only.
- Scaled scenarios should exercise the documented runtime and interface budgets.
- The package should provide validation evidence without embedding host-specific
  implementation logic.
- Institution and points-ledger scenarios should stay as handoff previews rather
  than becoming authoritative world or economy simulators.
