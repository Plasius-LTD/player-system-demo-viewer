# AGENTS.md

## Scope
- This repository contains `@plasius/player-system-demo-viewer`.
- The package provides a static validation launcher and scenario manifest surface for Player System demos.

## Setup
- Use Node.js 24 or later (see `.nvmrc`) and npm.
- Install dependencies with `npm ci`.

## Common Commands
- `npm run build`
- `npm run test`
- `npm run test:coverage`
- `npm run lint`
- `npm run typecheck`
- `npm run pack:check`

## Repo Conventions
- Source lives in `src/`; tests live in `tests/`; package docs live in `docs/`; demos live in `demo/`.
- `dist/` and `coverage/` are generated output and must not be edited by hand.
- Keep TypeScript `strict`, preserve dual ESM/CJS packaging, and keep public exports intentional.
- Update `README.md`, `CHANGELOG.md`, and ADR/TDR/design docs for user-facing or architectural changes.

## Safety
- Never commit secrets, production tokens, or real player data.
- Keep package responsibilities within the documented boundary and route cross-package authority through explicit contracts.
