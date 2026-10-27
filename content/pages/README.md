# Atlas pages

Each concept's page in the atlas pages is a folder here, named by the concept's id,
with one Markdown + LaTeX file per depth:

```
content/pages/<concept-id>/depth-1.md
content/pages/<concept-id>/depth-2.md
…
```

Depths have no names — depth 1 first, each deeper one going further; readers choose how
deep to read. Write as many as the concept needs. The page also shows what the map knows
(definition, equation, assumptions, how it connects), so a depth needn't repeat it.

The cards' Markdown + LaTeX (`**bold**`, `*italic*`, `$x^2$`, `$$x^2$$` on its own
line), plus headings from `##`, lists (`-`, `1.`), blocks and links:

```
::: definition An optional title
Numbered within the page's section: Definition 3.1.1 on page 3.1.
Also theorem, lemma, example, remark, checkpoint; objectives and proof aren't numbered.
:::

See [[spacetime]], [[einstein_eq|the field equations]], [[relation:edge_id|this relation]]
or [a web page](https://example.org).
```

`npm run build:content` checks every depth (scripts/check-pages.mjs) and stops, naming
the file and line, if one won't show as written. See docs/AUTHORING.md → Atlas pages.
