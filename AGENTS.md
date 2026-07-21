# Agent Notes

## PR preview link for `index.html`

GitHub Raw may render HTML as plain text. For PR descriptions, include an **htmlpreview** link that wraps the raw file URL.

### Required format

- Raw URL:
  - `https://raw.githubusercontent.com/<owner>/<repo>/<commit-sha>/index.html`
- Preview URL (put this in PR body):
  - `https://htmlpreview.github.io/?<raw-url>`

### Steps for agents

1. Get the current commit SHA on the PR branch.
2. Build the raw URL for `index.html` at that SHA.
3. Build the htmlpreview URL by prefixing:
   - `https://htmlpreview.github.io/?`
4. Add the final preview URL to the PR description under a clear label (for example: `HTML preview`).

### Example

`https://htmlpreview.github.io/?https://raw.githubusercontent.com/danieljurek/college-runway/<sha>/index.html`
