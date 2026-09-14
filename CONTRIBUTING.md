# Contributing to mavplan-web

Thanks for helping improve the offline browser console for the
[mavplan](https://github.com/TianHengZhuang/mavplan) toolkit.

This app is pure client-side Vue 3 + TypeScript (Vite, Pinia, Vitest). There is
no backend; mission data stays in the browser.

## Development setup

Requirements: Node.js 20+ and npm.

```bash
git clone https://github.com/TianHengZhuang/mavplan-web.git
cd mavplan-web
npm ci
```

### Common scripts

```bash
npm run dev        # Vite dev server
npm run typecheck  # vue-tsc --noEmit
npm test           # vitest run
npm run build      # typecheck + production build to dist/
```

Run `npm run typecheck` and `npm test` before opening a PR.

## Project layout

| Path | Role |
| --- | --- |
| `src/core/` | Pure TS mission logic (no Vue): geo, patterns, preflight, I/O formats |
| `src/stores/` | Pinia stores (mission, settings) |
| `src/components/` | UI panels and map/profile widgets |
| `src/views/` | Route-level pages |
| `tests/` | Vitest specs (`*.spec.ts`) for core logic |

Prefer putting new domain logic in `src/core/` with a unit test under `tests/`
rather than only in a Vue component.

## Code style

- TypeScript strict-friendly; prefer explicit types on exported functions.
- Keep the app offline-capable — do not add required network calls at runtime.
- UI strings that face instructors/students should go through `src/core/i18n.ts`
  when adding zh-CN / en support.
- Match existing file naming (`PascalCase.vue` components, camelCase core modules).

## Pull requests

1. Fork and branch from `main`.
2. Add or update Vitest tests for behavior changes.
3. Keep PRs focused (one feature or fix when practical).
4. Fill in the PR template.
5. Update the README feature table / changelog notes for user-visible changes.

### Commit messages

Use clear imperative subjects, for example:

```
fix: preserve home alt when importing QGC plan
feat: add polygon zone ceiling editing
docs: document TaskSpec zones JSON layout
test: cover lawnmower lane spacing edge case
```

## Reporting bugs

Open an issue with:

- Browser and OS
- mavplan-web version (or commit)
- Steps to reproduce (and a sample mission JSON if possible)
- Expected vs actual behavior

## Related

- [mavplan](https://github.com/TianHengZhuang/mavplan) — Python CLI/library this console complements
- Live demo: https://tianhengzhuang.github.io/mavplan-web/

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
