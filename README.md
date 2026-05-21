# @plasius/player-system-demo-viewer

[![npm version](https://img.shields.io/npm/v/@plasius/player-system-demo-viewer.svg)](https://www.npmjs.com/package/@plasius/player-system-demo-viewer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/player-system-demo-viewer/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/player-system-demo-viewer/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/player-system-demo-viewer)](https://codecov.io/gh/Plasius-LTD/player-system-demo-viewer)
[![License](https://img.shields.io/github/license/Plasius-LTD/player-system-demo-viewer)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Static validation launcher and scenario manifest surface for Player System demos.

Apache-2.0. ESM + CJS builds. TypeScript types included.

## Installation

```bash
npm install @plasius/player-system-demo-viewer
```

## Scope

`@plasius/player-system-demo-viewer` owns the reusable manifest and scenario surface for:

- awakening demos
- combat-safe reduction demos
- institution-routing demos
- points-ledger demos
- launch, transition, and steady-state validation budgets for demo runs
- degraded-path expectations for runtime failures surfaced through demos
- privacy-safe sample personas and scaled composition evidence for runtime adoption

## Demo

```bash
npm run build
node demo/example.mjs
```

## Usage

```ts
import {
  createPlayerSystemDemoManifest,
  defaultPrivacySafeDemoScenarios,
  defaultPlayerSystemDemoPortabilityContract,
  defaultPlayerSystemDemoValidationContract,
} from "@plasius/player-system-demo-viewer";

const manifest = createPlayerSystemDemoManifest(defaultPrivacySafeDemoScenarios);

console.log(manifest.scenarios.length);
console.log(defaultPlayerSystemDemoValidationContract.performanceBudget.launchMs);
console.log(defaultPlayerSystemDemoPortabilityContract.sampleData.sampleClassification);
```

## Demo Validation Contract

The inherited feature flag for this work is `isekai.player-system.runtime-nfr.enabled`.

`defaultPlayerSystemDemoValidationContract` and `createPlayerSystemDemoValidationContract()` define:

- launch, transition, and steady-state frame budgets for demo validation
- warm-frame expectations before a scenario is considered stable
- degraded/failure handling that stays bounded and testable

## Demo Portability Contract

The inherited feature flag for this work is `isekai.player-system.runtime-portability.enabled`.

`defaultPlayerSystemDemoPortabilityContract`,
`createPlayerSystemDemoPortabilityContract()`,
`defaultPrivacySafeDemoScenarios`, and
`assessPlayerSystemDemoScenarioPortability()` define:

- synthetic-only sample personas that avoid direct real-user-like identifiers
- composition scenarios sized to the documented runtime and interface budgets
- reusable validation metadata for scaled demo evidence

## Governance

- ADRs: [docs/adrs](./docs/adrs)
- TDRs: [docs/tdrs](./docs/tdrs)
- Design notes: [docs/design](./docs/design)
- Parent feature flag: `isekai.player-system.packages.enabled`
- Capability: not required for package bootstrap; demo-launcher adoption remains feature-flag led
- Rollback: disable `isekai.player-system.packages.enabled` to halt package-family adoption without changing package code
