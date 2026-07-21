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
