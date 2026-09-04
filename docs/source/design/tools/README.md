# Hero tool designs and specs — as delivered

Committed in Round 17c from `THI__Tools_Hero_Section.zip`. **These are reference material, not
code to copy.** Round 17's audit (`docs/audits/round-17-plumbing-triage-blocked.md`) and Round
17c's (`round-17c-tools-inventory.md`) record what they do and do not support.

```
Plumbing Triage.dc.html        Roof Scan.dc.html
AC Lifespan.dc.html            Roof Cost Calculator.dc.html
Pipe Report.dc.html
specs/  page-brief · copy-deck · component-states · data-labeling-spec · motion-and-imagery

copy-deck-plumbing-triage.md   <- Round 18's source of truth for that tool's copy
```

⚠️ **`copy-deck-plumbing-triage.md` carries one applied correction.** The deck as delivered ended
the electrical-and-water interrupt with a line permitting breaker use "if the panel is dry and you
can reach it standing on dry ground." ESFI does not support it, the owner struck it, and it is
**not built**. The file marks the strike; `triagerender.mjs` asserts the line never returns.

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
