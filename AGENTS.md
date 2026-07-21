<<<<<<< HEAD
# Agent Notes

## PR preview link for behavior-changing app updates

If a change will alter the app's behavior or end-user experience, include an **htmlpreview** link for `index.html` in the PR description. GitHub Raw may render HTML as plain text, so wrap the raw URL with htmlpreview.

### Required format

- Raw URL:
  - `https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/index.html`
- Preview URL (put this in PR body):
  - `https://htmlpreview.github.io/?<raw-url>`

### When to include it

- UI changes
- Copy or content changes visible in the app
- Behavior changes that affect calculations, defaults, inputs, or outputs

If the change does **not** affect app behavior or the rendered experience (for example, agent docs or other internal-only updates), the preview link is optional.

### Steps for agents

1. Get the current commit SHA on the PR branch.
2. Build the raw URL for `index.html` at that SHA.
3. Build the htmlpreview URL by prefixing:
   - `https://htmlpreview.github.io/?`
4. Add the final preview URL to the PR description under a clear label (for example: `HTML preview`).

### Example

`https://htmlpreview.github.io/?https://raw.githubusercontent.com/danieljurek/college-runway/<sha>/index.html`
=======
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
- For PRs that touch `index.html` or visible app behavior, include a preview link:
  `https://htmlpreview.github.io/?https://github.com/danieljurek/college-runway/blob/<commit-sha>/index.html`
>>>>>>> origin/main
