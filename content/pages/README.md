# Atlas pages

Each concept's page in the atlas pages is a folder here, named by the concept's id,
with one [Typst](https://typst.app/docs) file per depth:

```
content/pages/<concept-id>/depth-1.typ
content/pages/<concept-id>/depth-2.typ
…
```

Depths have no names — depth 1 first, each deeper one going further; readers choose how
deep to read. Write as many as the concept needs. The page also shows what the map knows
(definition, equation, assumptions, how it connects), so a depth needn't repeat it.

Blocks numbered within the page's section: `#definition[…]`, `#theorem[…]`, `#lemma[…]`,
`#example[…]`, `#remark[…]`, `#checkpoint[…]` (a title: `#definition(title: "…")[…]`);
not numbered: `#objectives[…]`, `#proof[…]`. Links: `#concept("id")[text]`,
`#relation("edge-id")[text]`, `#link("https://…")[text]`. Maths: `$…$` inline,
`$ … $` (with spaces) on its own line.

`npm run build:content` compiles every depth (scripts/compile-pages.mjs) and stops with
a message if one doesn't compile. See docs/AUTHORING.md → Atlas pages.
