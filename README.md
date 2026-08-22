# Texas Home Intelligence

Source for [texashomeintelligence.com](https://texashomeintelligence.com) &mdash; the
QuoteReady Project Brief tool and Texas homeowner intelligence site.

Built as a static [Jekyll](https://jekyllrb.com) site so GitHub Pages builds and
deploys it with no separate build step.

## Structure

- `_data/services/*.yml` &mdash; per-service copy (hero, sections, FAQ). `roofing`,
  `hvac`, and `plumbing` are supplied conversion copy; the other four services are
  draft copy pending editorial review (see `copy_status` in each file).
- `_data/locations.yml` &mdash; per-city metadata (Austin, San Antonio).
- `_data/service_list.yml` &mdash; the ordered list of services used in nav/footers/grids.
- `_layouts/service.html` &mdash; the reusable location&times;service page template. All
  14 `/​{location}​/​{service}​/` pages are just front matter pointing at this layout.
- `_layouts/location.html` &mdash; the reusable city-hub template (`/austin/`, `/san-antonio/`).
- `/data/` &mdash; the data catalog and data-detail page template/example
  (`/data/austin/roofing/`). Figures marked `SAMPLE` are illustrative placeholders
  for layout only, not live data &mdash; see `/methodology/`.
- `/start/` &mdash; a clickable, front-end-only prototype of the QuoteReady intake
  flow. It does not submit or store data yet; see `docs/source/THI_Wireframes_Developer_Handoff.docx`
  for the intended production intake/data architecture.
- `/brief-sample/` &mdash; a sample generated Project Brief, for illustration.
- `docs/source/` &mdash; original reference materials (copywriter output, wireframe
  handoff, keyword research). Excluded from the built site.

## Local preview

```
bundle install
bundle exec jekyll serve
```

## Deploying

GitHub Pages builds this repo automatically from the `main` branch. Custom domain
is set via the `CNAME` file; DNS for texashomeintelligence.com should point at
GitHub Pages per [their custom-domain docs](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site).
