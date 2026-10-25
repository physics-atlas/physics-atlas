// The atlas pages' Typst preamble: prepended to every page before it's
// compiled to HTML (scripts/compile-pages.mjs). It gives authors the blocks of
// lecture notes, numbered within the page's section ("Definition 3.1.2"), and
// links to other pages. Each block is a <section> with a class the site styles;
// its label is part of the text, so it's read out and printed too.
//
// Inputs (sys.inputs): "section" — the page's number in the contents, e.g. "3.1".

#let atlas-section = sys.inputs.at("section", default: "")
#let atlas-counter = counter("atlas-block")

#let atlas-block(kind, label, title, body) = {
  atlas-counter.step()
  context {
    let n = atlas-counter.get().first()
    let number = if atlas-section == "" { str(n) } else { atlas-section + "." + str(n) }
    html.elem("section", attrs: (class: "atlas-tblock atlas-tblock-" + kind))[
      #html.elem("p", attrs: (class: "atlas-tblock-label"))[#strong[#label #number] #if title != none [(#title)]]
      #body
    ]
  }
}

#let definition(title: none, body) = atlas-block("definition", "Definition", title, body)
#let theorem(title: none, body) = atlas-block("theorem", "Theorem", title, body)
#let lemma(title: none, body) = atlas-block("theorem", "Lemma", title, body)
#let example(title: none, body) = atlas-block("example", "Example", title, body)
#let remark(title: none, body) = atlas-block("remark", "Remark", title, body)
#let checkpoint(title: none, body) = atlas-block("checkpoint", "Checkpoint", title, body)

// Not numbered: what the page sets out to teach, and a proof that follows a block.
#let objectives(body) = html.elem("section", attrs: (class: "atlas-tblock atlas-tblock-objectives"))[
  #html.elem("p", attrs: (class: "atlas-tblock-label"))[*Objectives*]
  #body
]
#let proof(body) = html.elem("section", attrs: (class: "atlas-tblock atlas-tblock-proof"))[
  #html.elem("p", attrs: (class: "atlas-tblock-label"))[_Proof._]
  #body
]

// Links to another page of the atlas: #concept("id")[text], #relation("edge-id")[text].
#let concept(id, body) = link("?mode=page&concept=" + id, body)
#let relation(id, body) = link("?mode=page&relation=" + id, body)
