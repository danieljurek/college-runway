# College Runway

A dependency-free, single-page model for allocating one lump sum across a configurable number of Vanguard 529 accounts and comparing projected balances with four years of public-college costs. The model starts with three children and supports adding or removing accounts.

Open `index.html` directly in a browser, or serve the directory with any static file server.

Run the dependency-free regression suite with:

```sh
node --test tests/app.test.js
```

If a pull request changes app behavior or the rendered user experience, include an `HTML preview` link in the PR description using `https://htmlpreview.github.io/?<raw-github-index-url>` so reviewers can open the exact commit without cloning.

The model:

- saves inputs to browser `localStorage`;
- exports and imports the complete model as a versioned, URL-safe Base64 code with no backend or network request;
- models a one-time lump-sum allocation plus an optional fixed annual contribution for each child until enrollment;
- uses the current browser date as the starting point for growth, inflation, and contribution timing;
- uses Vanguard's July 2026 target-enrollment asset allocations as glide-path anchors;
- interpolates the allocation quarterly and applies editable stock, bond, and reserve return assumptions;
- models four annual withdrawals and college-cost inflation;
- checks the chosen target-enrollment portfolio against the expected enrollment year.

This is a planning estimate, not investment, tax, or legal advice.

Base64 snapshots are portable encoding, not encryption. Anyone who receives a snapshot can decode its names, birthdays, balances, and assumptions.
