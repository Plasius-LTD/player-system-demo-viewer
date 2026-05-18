# Contributing to @plasius/player-system-demo-viewer

First off: thanks for taking the time to contribute.
This document explains how to work on the project, how to propose changes, and what we expect in pull requests.

> TL;DR
>
> - Be respectful and follow the Code of Conduct.
> - Open an issue before large changes; small fixes can go straight to a PR.
> - Write tests, keep coverage steady or improving.
> - Use Conventional Commits.
> - Don’t include real PII in code, issues, tests, or logs.

---

## Code of Conduct

Participation in this project is governed by our **Code of Conduct** (see `CODE_OF_CONDUCT.md`). By participating, you agree to abide by it.

## Licensing & CLA

This project is open source (see `LICENSE`). To protect contributors and users, we require contributors to agree to our Contributor License Agreement before we can merge PRs. See `legal/INDIVIDUAL_CLA.md` and `legal/CORPORATE_CLA.md`.

> If your company has special legal needs, contact the maintainers before sending large PRs.

## Security

**Never** report security issues in public issues or PRs. Instead, follow the process in `SECURITY.md`.

---

## What this project does

`@plasius/player-system-demo-viewer` provides static validation launcher and scenario manifest surface for Player System demos.

Contributions typically fall into demo manifests, scenario fixtures, validation helpers, docs, tests, and tooling quality.

---

## Getting started (local dev)

### Prerequisites

- Node.js (use the version specified in `.nvmrc` if present: `nvm use`).
- npm (we use npm scripts in this repo).

### Install

```bash
npm ci
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
# or, if using Vitest in watch mode
npm run test:watch
```

### Lint

```bash
npm run lint
npm run typecheck
```

---

## How to propose a change

### 1) For bugs

- Search existing issues first.
- Open a new issue with:
  - Clear title, steps to reproduce, expected vs actual behaviour,
  - Minimal repro (code snippet or small repo),
  - Environment info (OS, Node, package version).

### 2) For features / refactors

- For anything non-trivial, open an issue first and outline the proposal.
- If the change affects public API or architecture, add an ADR draft (see `docs/adrs/`).

### 3) Good first issues

We label approachable tasks as **good first issue** and **help wanted**.

---

## Branch, commit, PR

**Branching**

- Fork or create a feature branch from `main`: `feat/xyz` or `fix/abc`.

**Commit messages** (Conventional Commits)

- `feat: add new exported helper`
- `fix: correct runtime edge-case`
- `docs: expand usage examples`
- `refactor: simplify package boundary`
- `test: add coverage for package contracts`
- `chore: bump dev deps`

**Pull Requests**

- Keep PRs focused and small when possible.
- Include tests for new or changed behaviour.
- Update docs (README, JSDoc, ADRs) as needed.
- Add a clear description of what and why, with before/after examples if useful.
- Ensure CI is green (lint, build, tests).

**PR checklist**

- [ ] Title uses Conventional Commits
- [ ] Tests added or updated
- [ ] Lint passes (`npm run lint`)
- [ ] Typecheck passes (`npm run typecheck` when defined)
- [ ] Build passes (`npm run build`)
- [ ] Docs updated (README, ADR, CHANGELOG if needed)
- [ ] No real PII in code, tests, or logs

---

## Coding standards

- **Language:** TypeScript with strict types where practical.
- **Style:** ESLint and repo standards.
- **Tests:** Prefer Vitest, and add focused coverage for exported behaviour.
- **Public API:** Aim for backward compatibility; use SemVer and mark breaking changes clearly (`feat!:` or `fix!:`).
- **Performance:** Avoid unnecessary allocations and excessive runtime coupling.
- **Docs:** Add concise TSDoc comments for exported types and functions when they add clarity.

---

## Adding dependencies

- Minimise runtime dependencies; prefer dev dependencies where possible.
- Justify any new runtime dependency in the PR description (size, security, maintenance).
- Avoid transitive heavy dependencies unless critical.

---

## Versioning & releases

- We follow **SemVer**.
- Breaking changes require a major bump and migration notes.
- Keep `CHANGELOG.md` clear about user-facing changes.

---

## Documentation

- Update `README.md` with new features or setup steps.
- Add or update ADRs in `docs/adrs/` for architectural decisions.
- Add or update TDRs and design notes when the package boundary or delivery plan changes.
- Keep examples minimal, copy-pasteable, and tested when feasible.

---

## Questions

If you have questions or want feedback before building:

- Open a discussion or issue with a short proposal.
- Or draft a PR early and mark it as **Draft** to get directional feedback.
