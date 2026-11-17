# Graph Report - physics-atlas  (2026-11-14)

## Corpus Check
- 363 files · ~174,683 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: (none) 3, .css 2, .example 1)

## Summary
- 1306 nodes · 3334 edges · 60 communities (57 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 110 edges (avg confidence: 0.88)
- Token cost: 319,931 input · 0 output

## Community Hubs (Navigation)
- Community Backend Server
- Page and Rich Text Parsing
- Design Decisions History
- App Shell and Navigation
- Layout Optimizer
- Graph Canvas Rendering
- Draft Export and Ids
- Content Validator
- Proposal Editor Fields
- Community Review Epic
- Package Dependencies
- Atlas Concept Pages
- Concept Graph Core
- Agent Workflow Rules
- Map View and Submission
- Concept Layout Search
- Browser API and Feedback
- Atlas Contents Tree
- Draft to Concept Node
- Backlog and Commit Modes
- Concept File Tooling
- Browser Smoke Test
- Proposal Checks
- Proposal Store
- Concept Card Sections
- Early Topic Map Plans
- Authoring Guide
- App TypeScript Config
- Written Atlas Pages
- Type Colours and Legend
- Data Types and Icons
- Edge Conflict Detection
- Server TypeScript Config
- Accessibility Rules
- Community Testing Guide
- CI Checks Workflow
- Node TypeScript Config
- Draft Storage
- Relation Types and Picker
- Pictures Handling
- Page Sidebar and Filters
- Page Check Script
- Concept Schema Plan
- Concept Map Rendering Plan
- Proposal Card
- Relation Cards and Links
- Seed Data Migration
- Content Compiler
- Proposal Fixtures
- Backend Setup Guide
- Layout Build Script
- npm Scripts
- Preflight Script
- Generality and Importance
- Project Overview
- Lint Config
- Component Packing
- MCP Config
- Root TypeScript Config
- Template Init Script

## God Nodes (most connected - your core abstractions)
1. `ConceptMapView()` - 46 edges
2. `Design Decisions log` - 40 edges
3. `Physics Atlas Roadmap` - 38 edges
4. `DraftEditor()` - 34 edges
5. `GraphNode` - 33 edges
6. `handle()` - 32 edges
7. `GraphView()` - 30 edges
8. `Epic: community proposals, expert review and auditable graph history` - 29 edges
9. `react` - 28 edges
10. `Authoring Guide — adding concepts & relations` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Atlas pages format (content/pages/<id>/depth-<n>.md)` --semantically_similar_to--> `Numbered blocks (::: definition / theorem …)`  [INFERRED] [semantically similar]
  docs/AUTHORING.md → content/pages/README.md
- `jeans()` --calls--> `newDraft()`  [EXTRACTED]
  server/api.test.ts → src/community/draft.ts
- `Review feature-16 (PASS)` --references--> `feature-19 bug: goal pick no highlight on full map`  [INFERRED]
  .claude/reviews/feature-16.md → BACKLOG.md
- `content/concepts/ (one file per node and edge)` --implements--> `One JSON file per node/edge compiled into concepts.json`  [INFERRED]
  CLAUDE.md → .claude/plans/epic-community-review.md
- `src/graph/concepts.ts concept rules (nodeRadius, revealZoom, edgeWeight, conceptPathFor)` --conceptually_related_to--> `conceptPathFor() goal path`  [INFERRED]
  CLAUDE.md → .claude/plans/feature-17-concept-learning-flow.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Agent pipeline: planner → developer → reviewer → committer → live-qa** — _claude_agents_planner, _claude_agents_developer, _claude_agents_reviewer, _claude_agents_committer, _claude_agents_live_qa, _claude_agents_orchestrator [EXTRACTED 1.00]
- **Concept graph migration stages (feature-15 → 16 → 17)** — _claude_plans_feature_15_concept_schema_foundation, _claude_plans_feature_16_concept_map_rendering, _claude_plans_feature_17_concept_learning_flow, _claude_reviews_wave_1 [EXTRACTED 1.00]
- **Community review epic phases** — _claude_plans_epic_community_review_phase_0, _claude_plans_epic_community_review_phase_1, _claude_plans_epic_community_review_phase_2, _claude_plans_epic_community_review_phase_2b, _claude_plans_epic_community_review_phase_3, _claude_plans_epic_community_review_phase_4, _claude_plans_epic_community_review_phase_5, _claude_plans_epic_community_review_phase_6, _claude_plans_epic_community_review_phase_7 [EXTRACTED 1.00]
- **Community review phases 0–3 (features 33, 34, 35, 42, 36)** — roadmap_feature_33_community_review_phase_0, roadmap_feature_34_community_review_phase_1, roadmap_feature_35_community_review_phase_2, roadmap_feature_42_community_review_phase_2b, roadmap_feature_36_community_review_phase_3, roadmap_epic_community_review [EXTRACTED 1.00]
- **Evolution of assumptions: edge conditions → concepts → words** — docs_design_decisions_decision_16_conditions_edge_attributes, docs_design_decisions_decision_33_assumptions_as_concepts_relation_cards, docs_design_decisions_decision_35_assumption_is_words, docs_design_decisions_decision_40_editor_order_pictures_motion, docs_authoring_concept_assumes, docs_authoring_relation_assumes [EXTRACTED 1.00]
- **Concept layout evolution (dagre → force → build-time → crossings first)** — docs_design_decisions_decision_14_per_component_dagre_crossing_search, docs_design_decisions_decision_15_direction_free_force_layout, docs_design_decisions_decision_28_layout_spacing_0_84, docs_design_decisions_decision_32_layout_room_for_relation_names, docs_design_decisions_decision_34_build_time_layout, docs_design_decisions_decision_41_crossings_first [EXTRACTED 1.00]

## Communities (60 total, 3 thin omitted)

### Community 0 - "Community Backend Server"
Cohesion: 0.05
Nodes (64): backTo(), Cached, client(), expertFor(), experts(), handle(), json(), mayPublish() (+56 more)

### Community 1 - "Page and Rich Text Parsing"
Cohesion: 0.07
Nodes (46): Block, Inline, parseInline(), parseRichText(), VariableRows(), EquationView(), FormulaView(), Variables() (+38 more)

### Community 2 - "Design Decisions History"
Cohesion: 0.07
Nodes (26): Design Decisions log, Multi-agent workflow (planner, developer, reviewer, committer, live-qa), feature-13: Category colours + goal highlighting, feature-14: Topic cleanup, default subtopics, hover zoom, feature-16: Concept map view — type colours, generality-sized nodes, feature-17: Concept learning flow — goal path over strict prerequisites, feature-21: Concepts takes the Full Map's place in navigation, feature-25: Concept layout with minimal crossings (+18 more)

### Community 3 - "App Shell and Navigation"
Cohesion: 0.08
Nodes (35): App(), conceptSearchEntries, FeedbackView, initialConceptGoal(), initialMode(), initialPage(), isConceptView(), isFluff() (+27 more)

### Community 4 - "Layout Optimizer"
Cohesion: 0.14
Nodes (40): alignWide(), arrangeComponent(), better(), boxesOverlap(), ccw(), clearance(), copy(), countBoxOverlaps() (+32 more)

### Community 5 - "Graph Canvas Rendering"
Cohesion: 0.11
Nodes (35): DraftShape, canvasMeasure(), conceptEdgeElement(), conceptElements(), conceptNodeElement(), DraftOverlay, fitBeside(), fitZoom() (+27 more)

### Community 6 - "Draft Export and Ids"
Cohesion: 0.11
Nodes (31): afterSubmission(), conceptId(), draftDependencies(), draftEdges(), draftPage(), draftProposal(), draftRef(), draftRelationTypes() (+23 more)

### Community 7 - "Content Validator"
Cohesion: 0.07
Nodes (29): npm run validate (data gate), findCycle(), ALLOWED_ATTRS, allowedAttrsFor(), assumedIds, ASSUMPTION_KEYS, byId, casingByType (+21 more)

### Community 8 - "Proposal Editor Fields"
Cohesion: 0.11
Nodes (31): DraftAssumption, DraftField, DraftFigure, DraftRelation, EVIDENCE_LABELS, ExportFile, MEDIA_TYPES, PROPOSABLE_TYPES (+23 more)

### Community 9 - "Community Review Epic"
Cohesion: 0.10
Nodes (20): Epic: community proposals, expert review and auditable graph history, src/graph/conflicts.ts conflict detection, Decisions D1–D7, community/experts.json, ORCID identity linking, Phase 0 — groundwork (feature-33), Phase 1 — read-only proposed layer (feature-34), Phase 2 — staging-area editor (feature-35) (+12 more)

### Community 10 - "Package Dependencies"
Cohesion: 0.09
Nodes (30): dependencies, cytoscape@^3.34.0, katex@^0.19.0, react@^19.2.7, react-dom@^19.2.7, devDependencies, oxlint@^1.71.0, puppeteer-core@^25.3.0 (+22 more)

### Community 11 - "Atlas Concept Pages"
Cohesion: 0.19
Nodes (26): ConceptPage(), pageLink(), Placement(), typeOf(), useWrittenDepths(), LinkProps, Links, makeLinks() (+18 more)

### Community 12 - "Concept Graph Core"
Cohesion: 0.12
Nodes (26): Assumption, EDGE_SENTENCE_TEMPLATES, conceptLayoutInput(), nodeLabelLayout(), relationLabelBox(), assumedConceptIds(), buildConceptIndex(), ConceptPath (+18 more)

### Community 13 - "Agent Workflow Rules"
Cohesion: 0.12
Nodes (16): Committer agent, Developer agent, Live-QA agent, Chrome DevTools MCP, Live-QA checks by subsystem, Orchestrator playbook, Per-feature flow (plan → developer → reviewer → committer), Planner agent (+8 more)

### Community 14 - "Map View and Submission"
Cohesion: 0.12
Nodes (28): loginHref(), submitProposal(), hasContent(), newDraft(), newEditDraft(), randomSuffix(), toDraftRepresentation(), mergedGraph() (+20 more)

### Community 15 - "Concept Layout Search"
Cohesion: 0.10
Nodes (24): arrangeConceptComponent(), ARROW_SCALE, ConceptComponent, ConceptLayoutInput, conceptNodeBox(), EDGE_LABEL_MAX, EDGE_WIDTH, glyphMeasure() (+16 more)

### Community 16 - "Browser API and Feedback"
Cohesion: 0.14
Nodes (23): vitest, backend(), FeedbackResult, fetchMe(), logout(), Me, readSignInProblem(), SignInProblem (+15 more)

### Community 17 - "Atlas Contents Tree"
Cohesion: 0.12
Nodes (24): NodeType, relationCategory(), CardSection, ConditionSection, effectiveGenerality(), GENERALITY_MAX, buildContents(), byStanding() (+16 more)

### Community 18 - "Draft to Concept Node"
Cohesion: 0.13
Nodes (25): clamp(), cleanAssumptions(), cleanFormulas(), cleanRepresentations(), cleanVariables(), dataExt(), draftFigures(), draftNode() (+17 more)

### Community 19 - "Backlog and Commit Modes"
Cohesion: 0.11
Nodes (16): Verdict PASS / ADVISORY / BLOCK, Plan feature-21: Concepts replace Full Map in nav, Review feature-17 (PASS with advisory), .goal-node opacity advisory, Review feature-21 (PASS), Wave 1 Live-QA report (PASS), Stale cy.fit after container resize (pre-existing), Physics Atlas Backlog (+8 more)

### Community 20 - "Concept File Tooling"
Cohesion: 0.14
Nodes (17): at, ctx, draft, edit, validateWith(), byId(), EDGES_DIR, formatEntity() (+9 more)

### Community 21 - "Browser Smoke Test"
Cohesion: 0.09
Nodes (12): cardChecks, compiled, errors, expected, funMoved, moved, movedByDraft, ROOT (+4 more)

### Community 22 - "Proposal Checks"
Cohesion: 0.14
Nodes (22): openProposals(), figureProblems(), assumptionsText(), badgeText(), ConceptOverlay, FieldChange, figuresText(), inRange() (+14 more)

### Community 23 - "Proposal Store"
Cohesion: 0.15
Nodes (16): GitHubStore, confirmed, newNode(), proposal(), DraftContext, fixtureProposals(), FIXTURES, FixtureStore (+8 more)

### Community 24 - "Concept Card Sections"
Cohesion: 0.19
Nodes (21): AssumptionList(), ConceptCard(), ConceptCardProps, ConceptList(), Todo(), TypeBadge(), GraphNode, CARD_SECTIONS (+13 more)

### Community 25 - "Early Topic Map Plans"
Cohesion: 0.18
Nodes (11): Plan feature-13: Category colours + goal highlighting, categoryColors.ts + categoryOf() fallback, Goal bar with Open curriculum CTA, Gold goal-node class with ★ badge, Measured four-colour palette (contrast + CVD ΔE), Plan feature-14: Topic cleanup + default subtopics + hover zoom, Subtopics open by default, Plan feature-17: Concept learning flow (+3 more)

### Community 26 - "Authoring Guide"
Cohesion: 0.15
Nodes (19): Authoring Guide — adding concepts & relations, Assumptions — assumes on the concept, Concept curriculum via strict prerequisite for, Concept graph (16+ types, sentence relations), conceptVocabulary.json, epistemicStatus, Equations in LaTeX with representations, Equation variable suggestions (equationSymbols.ts) (+11 more)

### Community 27 - "App TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 28 - "Written Atlas Pages"
Cohesion: 0.17
Nodes (17): Conservation of mass: ρ(x,t)d³x = ρ_initial(q)d³q, Euler–Lagrangian coordinate transformation x_i = q_i + Γ_i(q,t), Jacobian determinant J = det(δ_ij + ∂Γ_i/∂q_j), Lagrangian Formulation (fluid) — depth 1 page, Atlas pages README, scripts/check-pages.mjs build check, Per-depth Markdown + LaTeX files, Numbered blocks (::: definition / theorem …) (+9 more)

### Community 29 - "Type Colours and Legend"
Cohesion: 0.16
Nodes (15): react, STATUSES, TypeLegend(), NODE_TYPE_DEFINITIONS, NODE_TYPE_LABELS, LEARNING_TYPES, RESEARCH_TYPES, contrast() (+7 more)

### Community 30 - "Data Types and Icons"
Cohesion: 0.16
Nodes (15): CATEGORY_OF, ConceptAttrs, FormalismAttrs, GraphNodeBase, LearningGoalAttrs, NodeTypeDefinition, RELATION_CATEGORIES, RelationCategory (+7 more)

### Community 31 - "Edge Conflict Detection"
Cohesion: 0.18
Nodes (14): EdgeConflict, edgeConflicts(), EdgeContext, EdgeSource, LabelMatchReason, labelSimilarity(), normalizeLabel(), similarLabels() (+6 more)

### Community 32 - "Server TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 33 - "Accessibility Rules"
Cohesion: 0.15
Nodes (14): Accessibility and Universal Design for Learning, axe-core automated checks, Colour never carries meaning alone, Map on a phone, and feedback form accessibility, No grey text for de-emphasis (typographic secondary cues), Pictures: required alt and credit, Reduce motion toggle (reducedMotion()), Universal Design for Learning (UDL 3.0, CAST) (+6 more)

### Community 34 - "Community Testing Guide"
Cohesion: 0.17
Nodes (14): Known accessibility gaps, content/concepts one file per node/edge, Taking in a proposal from the editor, Coming phases 4–7 (voting, moderation, accountability, hardening), Conflict detection (similar names, duplicates, loops), Phase 0 — groundwork tests, Phase 2 — proposal editor tests, Phase 3 — sign in, submit as PR tests (+6 more)

### Community 35 - "CI Checks Workflow"
Cohesion: 0.12
Nodes (16): runs-on, steps, jobs, checks, name, on, pull_request, push (+8 more)

### Community 36 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 37 - "Draft Storage"
Cohesion: 0.23
Nodes (14): Draft, isString(), parseDraft(), withoutDraft(), db(), loadPictures(), savePictures(), Evidence (+6 more)

### Community 38 - "Relation Types and Picker"
Cohesion: 0.18
Nodes (12): draftProblems(), inRange(), OTHER_RELATION, relationPhrase(), relationTypeProblems(), categories, withRelationTypes(), ProposedRelationType (+4 more)

### Community 39 - "Pictures Handling"
Cohesion: 0.21
Nodes (13): FIGURE_MAX_BYTES, FIGURE_MAX_SIDE, FIGURE_TYPES, FigureExt, figureSlug(), MAX_FIGURES, sniffImage(), PNG (+5 more)

### Community 40 - "Page Sidebar and Filters"
Cohesion: 0.29
Nodes (13): FilterGroup, FilterGroups(), GroupBox(), ContentsTree(), currentMark(), NeighboursList(), Sidebar(), TypeList() (+5 more)

### Community 41 - "Page Check Script"
Cohesion: 0.15
Nodes (8): vite@^8.1.1, vite, { base }, contents, edgeIds, PAGES, problems, ROOT

### Community 42 - "Concept Schema Plan"
Cohesion: 0.22
Nodes (10): Contested status with dispute thread, relativistic-hydro pilot topic (Israel-Stewart), Plan feature-15: Concept graph schema foundation, src/data/concepts.json concept dataset, normalizeRelationship + edgeSentence, scripts/lib/find-cycle.mjs findCycle, GraphNode / GraphEdge types, Sophie seed graph-data.json (54 nodes / 59 edges) (+2 more)

### Community 43 - "Concept Map Rendering Plan"
Cohesion: 0.21
Nodes (9): generality (1–5, optional), Plan feature-16: Concept map rendering, Browse by type keyboard index, ConceptMapView (?mode=concepts), effectiveGenerality + nodeRadius (degree fallback), Validated 12-type palette (typeColors.ts), Zoom-linked fade (zoom-faded, label-hidden), Review feature-16 (PASS) (+1 more)

### Community 44 - "Proposal Card"
Cohesion: 0.22
Nodes (11): SignedInUser, SubmitResult, evidenceHref(), CONCEPT_CARD_TITLE_ID, DraftEditorProps, ProposalCard(), ProposalCardProps, VOTES (+3 more)

### Community 45 - "Relation Cards and Links"
Cohesion: 0.31
Nodes (10): EDGE_CARD_TITLE_ID, EdgeCard(), ConnectionsDiagram(), shorten(), FurtherReached, Reached, hrefOf(), isPlainClick() (+2 more)

### Community 46 - "Seed Data Migration"
Cohesion: 0.30
Nodes (11): review field — open questions, convert_seed_data.py (reference), Data-quality issues (casing, reversed e57, derived from/by, e35, orphans), Degree-based generality placeholder, EDGE_SENTENCE_TEMPLATES (18 relationship strings), Physics Atlas — multi-type graph migration brief, Non-production preview artifact (force-graph), data/seed/graph-data.json (+3 more)

### Community 47 - "Content Compiler"
Cohesion: 0.18
Nodes (8): { graph, problems }, OUT, ROOT, SOURCE, chars, OUT, RANGES, ROOT

### Community 48 - "Proposal Fixtures"
Cohesion: 0.36
Nodes (9): Proposal shape (src/community/types.ts), sample-edit-vlasov.json (an edit), sample-jeans-mass.json (depends on Jeans scale), sample-jeans-scale.json, Sample proposals (test fixtures), Phase 1 — proposed layer tests, Phase 2b — drafts, dependencies, edits tests, feature-34: Community review Phase 1 — proposed layer (+1 more)

### Community 49 - "Backend Setup Guide"
Cohesion: 0.31
Nodes (9): Cloudflare Worker (worker/index.ts + server/api.ts), Setting up the community backend (Phase 3), GitHub App (Contents, Pull requests, Issues write), Invite list (community/experts.json, ALLOWED_PROPOSERS), Security notes (signed cookie, App scope), Sign-in troubleshooting, Worker settings (GITHUB_REPO, SESSION_SECRET, DIRECT_PUBLISH…), wrangler.jsonc (+1 more)

### Community 50 - "Layout Build Script"
Cohesion: 0.18
Nodes (7): CODE, codeHash, components, input, OUT, ROOT, started

### Community 51 - "npm Scripts"
Cohesion: 0.20
Nodes (10): scripts, build, build:content, dev, lint, preview, smoke, test (+2 more)

### Community 52 - "Preflight Script"
Cohesion: 0.39
Nodes (6): fail(), ok(), say(), preflight.sh script, warn(), start-dev-session.sh script

### Community 53 - "Generality and Importance"
Cohesion: 0.29
Nodes (5): generality (1–10): circle size, importance (1–10): zoom visibility, Map depth — zooming reveals detail (feature-43), feature-41: Generality sizes, importance zooms, feature-43: Depth by zoom

### Community 54 - "Project Overview"
Cohesion: 0.33
Nodes (6): Cloudflare Worker SPA hosting with small /api, content/concepts/ (one file per node and edge), Accessible typed concept graph of physics, index.html SPA entry page, Physics Atlas README, Live site physics-atlas.gnmdaudt.workers.dev

### Community 55 - "Lint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 56 - "Component Packing"
Cohesion: 0.50
Nodes (4): extent(), packComponents(), rowSize(), shelves()

## Knowledge Gaps
- **24 isolated node(s):** `npx`, `index.html SPA entry page`, `Chrome DevTools MCP`, `Phase 2b — several drafts, dependencies, edits (feature-42)`, `Phase 5 — moderation, review queue, merge` (+19 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 319 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `katex` connect `Package Dependencies` to `Page and Rich Text Parsing`, `Content Validator`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `ConceptMapView()` (e.g. with `hasContent()` and `byLabel()`) actually correct?**
  _`ConceptMapView()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `npx`, `index.html SPA entry page`, `Chrome DevTools MCP` to the rest of the system?**
  _24 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community Backend Server` be split into smaller, more focused modules?**
  _Cohesion score 0.05093632958801498 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Browser API and Feedback` to `Community Backend Server`, `Page and Rich Text Parsing`, `Layout Optimizer`, `Draft Export and Ids`, `Pictures Handling`, `Relation Types and Picker`, `Package Dependencies`, `Concept Graph Core`, `Concept Layout Search`, `Atlas Contents Tree`, `Concept File Tooling`, `Proposal Store`, `Type Colours and Legend`, `Edge Conflict Detection`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Should `Page and Rich Text Parsing` be split into smaller, more focused modules?**
  _Cohesion score 0.07380520266182698 - nodes in this community are weakly interconnected._
- **Why does `Plan feature-15: Concept graph schema foundation` connect `Concept Schema Plan` to `Concept Map Rendering Plan`, `Backlog and Commit Modes`, `Content Validator`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._