# Agent Instructions

## Repository overview

Single-page static app: `index.html`, `styles.css`, `app.js` at repo root. No build step, no package manager, no third-party dependencies. Tests live in `tests/`.

## Testing

```sh
node --test tests/app.test.js
```

Always run before and after code changes. All 10 tests must pass.

## GitHub Actions

- Use only GitHub-owned (`actions/*`) actions. No third-party actions.
- For static site publishing to GitHub Pages use this pattern:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - run: |
          mkdir -p site
          cp index.html styles.css app.js site/
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- No explanatory comments in workflow YAML.
- Stage only `index.html`, `styles.css`, `app.js` — never publish the repo root directly.

## PR descriptions

- Short bullets, information-dense. What changed and why. No filler.
- For PRs that touch `index.html` or visible app behavior, include both links:
  - **Commit preview** (exact SHA, works before merge):
    `https://htmlpreview.github.io/?https://raw.githubusercontent.com/danieljurek/college-runway/<commit-sha>/index.html`
  - **Live site** (reflects latest `main` after merge):
    `https://danieljurek.github.io/college-runway/`

If the change does **not** affect app behavior or the rendered experience (for example, agent docs or workflow-only updates), the preview links are optional.
