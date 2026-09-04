# Hero tool designs and specs — as delivered

Committed in Round 17c from `THI__Tools_Hero_Section.zip`. **These are reference material, not
code to copy.** Round 17's audit (`docs/audits/round-17-plumbing-triage-blocked.md`) and Round
17c's (`round-17c-tools-inventory.md`) record what they do and do not support.

```
Plumbing Triage.dc.html        Roof Scan.dc.html
AC Lifespan.dc.html            Roof Cost Calculator.dc.html
Pipe Report.dc.html
specs/  page-brief · copy-deck · component-states · data-labeling-spec · motion-and-imagery
```

## Two things deliberately NOT committed here

**The `_ds/` design system.** Compared file by file against `site/src/styles/thi/`: `colors`,
`typography`, `spacing`, `shape`, `motion` and `semantic` tokens plus `base/primitives.css` and
`styles.css` are **byte-identical** to what the repo already carries. Committing a second copy
would create two sources of truth for one thing.

⚠️ **`tokens/fonts.css` differs, and the repo's version is the correct one.** The delivered file
loads the three families with a remote `@import` nested inside an imported stylesheet — which the
CSS bundler drops, so it never reaches a visitor. The repo self-hosts them instead, and the file
documents why. **Do not "sync" the repo's fonts.css to this delivery; that would silently revert
the site to system fallbacks.**

**`support.js`, `image-slot.js`, `.thumbnail`.** Claude Design canvas runtime, not spec content.

The full `_ds` tree and those files remain in the source zip if provenance is ever needed.
