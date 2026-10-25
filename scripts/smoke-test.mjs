#!/usr/bin/env node
// Browser smoke test: drives the running dev server (npm run dev) with
// puppeteer-core + installed Chrome. Walks the home page, the concept map and
// the community view, and collects console errors. Screenshots go to SMOKE_OUT (default /tmp).
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = process.env.SMOKE_OUT ?? '/tmp';
const URL = process.env.DEV_URL ?? 'http://localhost:5173';
// The map everyone sees: the compiled graph without fun mode's fluff (and a
// relation only when both its concepts exist).
const compiled = JSON.parse(readFileSync(new globalThis.URL('../src/data/concepts.json', import.meta.url), 'utf8'));
const serious = new Set(compiled.nodes.filter((n) => n.type !== 'fluff').map((n) => n.id));
const expected = {
  nodes: serious.size,
  edges: compiled.edges.filter((e) => serious.has(e.source) && serious.has(e.target)).length,
};
const CHROME =
  process.env.CHROME_BIN ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
page.on('pageerror', (err) => errors.push(String(err)));

// --- Home page: galaxy hero; its search and landmark chips open the concept map ---
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.home .search-input');
console.log('home hero title:', await page.$eval('.home-title', (el) => el.textContent?.trim()));
await page.click('.home .search-input');
await page.type('.home .search-input', 'dark mat');
await page.waitForSelector('.search-result');
await page.keyboard.press('Enter');
await page.waitForSelector('.map-card');
const homeSearch = await page.evaluate(() => ({
  search: window.location.search,
  card: document.querySelector('.map-card-title')?.textContent?.trim(),
}));
console.log('home search "dark mat":', homeSearch);
if (!homeSearch.search.startsWith('?mode=concepts') || homeSearch.card !== 'Dark Matter')
  errors.push(`home search didn't open Dark Matter on the concept map: ${JSON.stringify(homeSearch)}`);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/home-search-focused.png` });

await page.goto(URL, { waitUntil: 'networkidle0' });
const landmarks = await page.$$eval('.goal-chip', (els) => els.map((e) => e.textContent?.trim()));
console.log('landmark chips:', landmarks);
if (landmarks.length === 0) errors.push('the home page shows no landmark chips');
await page.click('.goal-chip');
await page.waitForSelector('.map-card');
const chipCard = await page.$eval('.map-card-title', (el) => el.textContent?.trim());
if (chipCard !== landmarks[0]) errors.push(`landmark chip "${landmarks[0]}" opened "${chipCard}"`);

// The retired topic views' addresses land on the concept map.
for (const old of ['?mode=goal&goal=cosmology', '?mode=topic&id=quantum-mechanics', '?mode=map', '?mode=explore']) {
  await page.goto(`${URL}/${old}`, { waitUntil: 'networkidle0' });
  const now = await page.evaluate(() => window.location.search);
  if (now !== '?mode=concepts') errors.push(`${old} landed on ${now}, not the concept map`);
}

// --- Home → Explore now lands on the concept map, not the topic full map ---
await page.goto(`${URL}/`, { waitUntil: 'networkidle0' });
await page.click('.home-explore');
await new Promise((r) => setTimeout(r, 600));
const exploreSearch = await page.evaluate(() => window.location.search);
console.log('home-explore search:', exploreSearch);
if (!exploreSearch.startsWith('?mode=concepts'))
  errors.push(`expected home-explore to land on ?mode=concepts, got ${exploreSearch}`);
const exploreNodeCount = await page.evaluate(() => window.__cy?.nodes().length ?? 0);
if (exploreNodeCount !== expected.nodes)
  errors.push(`expected ${expected.nodes} concept nodes after home-explore, got ${exploreNodeCount}`);
const tabTexts = await page.$$eval('.mode-tab', (els) => els.map((e) => e.textContent?.trim()));
console.log('mode tabs:', tabTexts);
if (tabTexts.some((t) => t === 'Full map')) errors.push('a "Full map" tab is still in the header nav');

const firstTabActive = await page.$eval('.mode-tab', (el) => el.classList.contains('mode-tab-active'));
if (!firstTabActive) errors.push('first header tab is not active in concepts mode');

// The Community tab: the concept map with proposals and the editor, open to everyone for now.
const clickTab = (name) =>
  page.evaluate((n) => [...document.querySelectorAll('.mode-tab')].find((b) => b.textContent.trim() === n).click(), name);
await clickTab('Community');
await page.waitForFunction(() => window.__cy?.nodes('.overlay').length > 0, { timeout: 10000 });
const communityTab = await page.evaluate(() => ({
  search: window.location.search,
  current: document.querySelector('.mode-tab[aria-current="page"]')?.textContent?.trim(),
  propose: Boolean(document.querySelector('.concept-propose')),
  title: document.title,
}));
await clickTab('Concept map');
await new Promise((r) => setTimeout(r, 600));
const plainAgain = await page.evaluate(() => ({ search: window.location.search, proposals: window.__cy.nodes('.overlay').length }));
await page.goto(`${URL}/`, { waitUntil: 'networkidle0' });
await page.click('.home-community');
await new Promise((r) => setTimeout(r, 600));
const fromHome = await page.evaluate(() => window.location.search);
console.log('community tab:', communityTab, 'back to concept map:', plainAgain, 'from home:', fromHome);
if (communityTab.search !== '?mode=community' || communityTab.current !== 'Community' || !communityTab.propose)
  errors.push(`the Community tab didn't open the community view: ${JSON.stringify(communityTab)}`);
if (plainAgain.search !== '?mode=concepts' || plainAgain.proposals !== 0)
  errors.push(`the Concept map tab still shows proposals: ${JSON.stringify(plainAgain)}`);
if (fromHome !== '?mode=community') errors.push(`home's community button landed on ${fromHome}`);

// --- Concept map (pilot): the second GraphView input variant ---
await page.goto(`${URL}/?mode=concepts`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const conceptCounts = await page.evaluate(() => ({
  nodes: window.__cy?.nodes().length ?? 0,
  edges: window.__cy?.edges().length ?? 0,
}));
console.log(`concept map: ${conceptCounts.nodes} nodes, ${conceptCounts.edges} edges`);
if (conceptCounts.nodes !== expected.nodes || conceptCounts.edges !== expected.edges)
  errors.push(`expected ${expected.nodes} concept nodes / ${expected.edges} edges, got ${conceptCounts.nodes}/${conceptCounts.edges}`);
// Zoomed out to the overview, every visible line keeps ≥ 1 px on screen, and
// lines touching a landmark are drawn wider than lines between two details.
const lines = await page.evaluate(() => {
  const cy = window.__cy;
  const shown = cy.edges().filter((e) => !e.hasClass('zoom-hidden'));
  const px = shown.map((e) => parseFloat(e.style('width')) * cy.zoom());
  return { zoom: cy.zoom(), count: px.length, min: Math.min(...px), max: Math.max(...px) };
});
console.log('overview lines (on-screen px):', lines);
if (lines.count === 0 || lines.min < 0.99 || lines.max <= lines.min)
  errors.push(`overview lines aren't weighted as expected: ${JSON.stringify(lines)}`);
// Zoomed in until every relation name shows, no circle covers a shown name: the
// layout gives each relation room for its name, and the safety net hides the rest.
await page.evaluate(() => window.__cy.zoom(1.5));
await new Promise((r) => setTimeout(r, 500));
const coveredNames = await page.evaluate(() => {
  const cy = window.__cy;
  cy.edges().forEach((e) => e.numericStyle('font-size'));
  cy.forceRender();
  return cy
    .edges()
    .filter((e) => {
      const rs = e._private.rscratch, st = e._private.rstyle;
      if (!st.labelWidth || e.hasClass('label-covered')) return false;
      const ux = Math.cos(rs.labelAngle ?? 0), uy = Math.sin(rs.labelAngle ?? 0);
      return cy.nodes().some((n) => {
        const dx = n.position().x - rs.labelX, dy = n.position().y - rs.labelY, r = n.width() / 2;
        const along = Math.max(Math.abs(dx * ux + dy * uy) - st.labelWidth / 2, 0);
        const across = Math.max(Math.abs(-dx * uy + dy * ux) - st.labelHeight / 2, 0);
        return along * along + across * across < r * r;
      });
    })
    .map((e) => e.id());
});
console.log('relation names under a circle:', coveredNames.length);
if (coveredNames.length) errors.push(`relation names covered by a circle: ${coveredNames.join(', ')}`);
await page.evaluate(() => window.__cy.$id('einstein_eq').emit('tap'));
await page.waitForSelector('.map-card');
const conceptCard = await page.$eval('.map-card', (el) => el.textContent ?? '');
console.log('concept card has "leads to Newtonian Gravity":', conceptCard.includes('leads to Newtonian Gravity'));
if (!conceptCard.includes('leads to Newtonian Gravity'))
  errors.push('concept card is missing the einstein_eq → newtonian gravity relation sentence');
await page.screenshot({ path: `${OUT}/concepts.png` });

// The equation is typeset (KaTeX), and clicking off the concept keeps the view.
await page.waitForSelector('.map-card .katex', { timeout: 10000 });
const typeset = await page.$$eval('.map-card .katex', (els) => els.length);
await new Promise((r) => setTimeout(r, 1000));
const viewOn = await page.evaluate(() => ({ zoom: window.__cy.zoom(), pan: { ...window.__cy.pan() } }));
await page.evaluate(() => window.__cy.emit('tap'));
await new Promise((r) => setTimeout(r, 1000));
const viewOff = await page.evaluate(() => ({ zoom: window.__cy.zoom(), pan: { ...window.__cy.pan() } }));
const guide = await page.evaluate(() => ({
  hidden: document.getElementById('map-hint')?.hidden,
  button: document.querySelector('.map-hint-toggle')?.textContent,
}));
console.log('equation typeset:', typeset, '· view kept on deselect:', viewOn.zoom === viewOff.zoom, '· guide:', guide);
if (typeset < 2) errors.push('the Einstein equations card shows no typeset formula');
if (viewOn.zoom !== viewOff.zoom || Math.abs(viewOn.pan.x - viewOff.pan.x) > 0.5)
  errors.push('clicking off a concept moved the view');
if (!guide.hidden || guide.button !== 'How to read this map') errors.push(`the map guide didn't step aside: ${JSON.stringify(guide)}`);

// --- Fun mode: off by default; lonely concepts get speech bubbles, fluff appears,
//     and nothing on the map moves ---
await page.goto(`${URL}/?mode=concepts`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 600));
const funControl = (text) =>
  page.evaluate((t) => [...document.querySelectorAll('.graph-control')].find((b) => b.textContent.trim() === t).click(), text);
const basePositions = () =>
  page.evaluate(() => Object.fromEntries(window.__cy.nodes().not('.fluff-layer').map((n) => [n.id(), { ...n.position() }])));
const funState = () =>
  page.evaluate(() => ({
    fluff: window.__cy.nodes('.fluff-layer').length,
    bubbles: document.querySelectorAll('.graph-bubble').length,
    legendFun: [...document.querySelectorAll('.legend-type-group-name')].some((e) => e.textContent === 'Fun'),
  }));
const funOff = await funState();
const funBefore = await basePositions();
await funControl('Fun mode');
await new Promise((r) => setTimeout(r, 500));
const funOn = await funState();
const funAfter = await basePositions();
const funMoved = Object.keys(funBefore).filter(
  (id) => Math.hypot(funAfter[id].x - funBefore[id].x, funAfter[id].y - funBefore[id].y) > 0.5,
);
await funControl('Show all concepts');
await new Promise((r) => setTimeout(r, 400));
const bubbleClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.graph-bubble')].find((x) => !x.hidden);
  b?.click();
  return b?.textContent ?? '';
});
await page.waitForSelector('.map-card');
const bubbleCard = await page.$eval('.map-card-title', (el) => el.textContent?.trim());
await page.screenshot({ path: `${OUT}/fun-mode.png` });
await funControl('Show all concepts');
await funControl('Fun mode');
await new Promise((r) => setTimeout(r, 400));
const funOffAgain = await funState();
console.log('fun mode:', { funOff, funOn, moved: funMoved.length, bubbleClicked, bubbleCard, funOffAgain });
if (funOff.fluff || funOff.bubbles || funOff.legendFun) errors.push(`fun mode is not off by default: ${JSON.stringify(funOff)}`);
if (funOn.fluff !== 1 || funOn.bubbles !== 5 || !funOn.legendFun)
  errors.push(`fun mode should show 1 fluff concept, 5 lonely bubbles and the Fun legend: ${JSON.stringify(funOn)}`);
if (funMoved.length) errors.push(`fun mode moved ${funMoved.length} confirmed concepts`);
if (!bubbleClicked.startsWith(`${bubbleCard}:`)) errors.push(`a bubble ("${bubbleClicked}") opened "${bubbleCard}"`);
if (funOffAgain.fluff || funOffAgain.bubbles) errors.push(`turning fun mode off left ${JSON.stringify(funOffAgain)}`);

// --- Concept learning flow: goal path over strict prerequisites + progress ---
await page.goto(`${URL}/?mode=concepts&goal=lg_pt_3`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.concept-path-step');
const conceptSteps = await page.$$eval('.concept-path-step', (els) => els.length);
const conceptGoalMarked = await page.evaluate(() => window.__cy.$id('lg_pt_3').hasClass('goal-node'));
console.log(`concept path lg_pt_3: ${conceptSteps} steps, goal marked: ${conceptGoalMarked}`);
if (conceptSteps !== 7) errors.push(`expected 7 concept path steps, got ${conceptSteps}`);
if (!conceptGoalMarked) errors.push('lg_pt_3 is not marked as the goal node');
await page.click('.concept-path-step input[type=checkbox]');
await new Promise((r) => setTimeout(r, 250));
const conceptProgress = await page.evaluate(() => localStorage.getItem('physics-atlas-progress-v1') ?? '');
console.log('concept progress key stored:', conceptProgress.includes('"concept:linear_algebra"'));
if (!conceptProgress.includes('"concept:linear_algebra"'))
  errors.push('ticking the first concept step did not store concept:linear_algebra');
await page.screenshot({ path: `${OUT}/concepts-goal.png` });

// --- Community preview, Phase 1: proposed layer from the sample fixtures ---
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const confirmedPositions = () =>
  page.evaluate(() =>
    Object.fromEntries(window.__cy.nodes().not('.overlay').map((n) => [n.id(), { ...n.position() }])),
  );
// Clicks a map control by its text; returns its aria-pressed once React has re-rendered.
const clickControl = (text) =>
  page.evaluate(async (t) => {
    const find = () => [...document.querySelectorAll('.graph-control')].find((el) => el.textContent.trim() === t);
    find()?.click();
    await new Promise((r) => setTimeout(r, 100));
    return find()?.getAttribute('aria-pressed');
  }, text);

// The confirmed layout ships with the build: it's in place at once and no
// search runs in the browser. Then the same map with proposals.
await page.goto(`${URL}/?mode=concepts`, { waitUntil: 'networkidle0' });
const layoutAtLoad = await confirmedPositions();
await wait(1500);
const layoutBefore = await confirmedPositions();
const searched = Object.keys(layoutAtLoad).filter(
  (id) => Math.hypot(layoutAtLoad[id].x - layoutBefore[id].x, layoutAtLoad[id].y - layoutBefore[id].y) > 0.5,
);
if (searched.length)
  errors.push(`the shipped layout wasn't used — ${searched.length} concepts moved after load (npm run build:content?)`);
await page.goto(`${URL}/?mode=concepts&community=1`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__cy?.nodes('.overlay').length > 0, { timeout: 10000 });
await wait(500);
const layoutAfter = await confirmedPositions();
const moved = Object.keys(layoutBefore).filter(
  (id) => !layoutAfter[id] || Math.hypot(layoutAfter[id].x - layoutBefore[id].x, layoutAfter[id].y - layoutBefore[id].y) > 0.5,
);
const layer = await page.evaluate(() => {
  const cy = window.__cy;
  return {
    nodes: cy.nodes('.overlay').map((n) => n.id()),
    edges: cy.edges('.overlay').length,
    contested: cy.nodes('.status-contested').map((n) => n.id()),
    jeansLabel: cy.$id('jeans_scale_s1').data('label'),
    url: window.location.search,
    // A proposal that depends on another one relates to its proposed concept.
    dependent: cy.edges('.overlay').some((e) => e.source().id() === 'jeans_mass_s4' && e.target().id() === 'jeans_scale_s1'),
    // An edit is drawn on the confirmed concept; its removal on the confirmed relation.
    editLabel: cy.$id('vlasov_equation').data('label'),
    removal: cy.$id('e62').hasClass('removal-proposed') && cy.$id('e62').data('relation').includes('(removal proposed)'),
    // Each proposal sits next to the confirmed concept it connects to: that
    // concept ranks among the nearest confirmed ones (1 = the nearest).
    anchorRanks: [
      ['jeans_scale_s1', 'structure_formation'],
      ['nonlinear_growth_s2', 'zeldovich_approximation'],
      ['ultralight_bound_s3', 'wave_dark_matter'],
    ].map(([a, b]) => {
      const p = cy.$id(a).position();
      const d = (n) => Math.hypot(n.position().x - p.x, n.position().y - p.y);
      const nearest = cy.nodes().not('.overlay').sort((m, n) => d(m) - d(n)).map((n) => n.id());
      return nearest.indexOf(b) + 1;
    }),
  };
});
console.log('rank of each proposal\'s anchor among the nearest confirmed concepts:', layer.anchorRanks);
if (layer.anchorRanks.some((r) => r < 1 || r > 3))
  errors.push(`a proposal was placed away from its connection (anchor ranks ${layer.anchorRanks})`);
console.log(
  `proposed layer: ${layer.nodes.length} concepts, ${layer.edges} relations, contested ${layer.contested}; confirmed nodes moved: ${moved.length}`,
);
console.log('dependent proposal and edit:', { dependent: layer.dependent, editLabel: layer.editLabel, removal: layer.removal });
if (layer.nodes.length !== 4 || layer.edges !== 7)
  errors.push(`expected 4 proposed concepts / 7 relations, got ${layer.nodes.length}/${layer.edges}`);
if (!layer.dependent) errors.push('the dependent sample lost its relation to the proposal it depends on');
if (!layer.editLabel?.includes('✎ Edit proposed') || !layer.removal)
  errors.push(`the edit sample isn't marked on the map: ${layer.editLabel}, removal ${layer.removal}`);
if (layer.contested.join() !== 'ultralight_bound_s3') errors.push(`expected one contested proposal, got ${layer.contested}`);
if (moved.length) errors.push(`proposals moved confirmed concepts: ${moved.slice(0, 5).join(', ')}`);
if (!layer.jeansLabel?.includes('Proposed · ✓2 ✗0 ?1')) errors.push(`proposal badge missing: ${layer.jeansLabel}`);
if (layer.url !== '?mode=community') errors.push(`the old community address didn't open the community view: ${layer.url}`);
await page.screenshot({ path: `${OUT}/community-layer.png` });

await page.evaluate(() => window.__cy.$id('jeans_scale_s1').emit('tap'));
await page.waitForSelector('.map-card .proposal-claim .katex', { timeout: 10000 });
const proposalCard = await page.$eval('.map-card', (el) => el.textContent ?? '');
const cardChecks = {
  proposedBy: proposalCard.includes('Proposed by Sample contributor A'),
  sentence: proposalCard.includes('Jeans scale is a condition of Structure Formation'),
  tally: proposalCard.includes('Needs clarification'),
};
console.log('proposal card:', cardChecks);
if (!Object.values(cardChecks).every(Boolean)) errors.push(`proposal card incomplete: ${JSON.stringify(cardChecks)}`);
await page.screenshot({ path: `${OUT}/community-card.png` });
await page.keyboard.press('Escape');

// The toggles change what's drawn, never the view: zoom in, then flip them all.
const viewport = () => page.evaluate(() => ({ zoom: window.__cy.zoom(), ...window.__cy.pan() }));
await wait(1000);
await page.evaluate(() => [...document.querySelectorAll('.graph-control')].find((el) => el.getAttribute('aria-label') === 'Zoom in').click());
await wait(500);
const viewBefore = await viewport();
const proposedOff = await clickControl('Show proposed');
await wait(200);
const overlayHidden = await page.evaluate(() =>
  window.__cy.elements('.overlay').every((el) => el.style('display') === 'none'),
);
await clickControl('Show proposed');
const confirmedOff = await clickControl('Show confirmed');
await wait(200);
const context = await page.evaluate(() => ({
  hiddenConfirmed: window.__cy.nodes().not('.overlay').filter((n) => n.style('display') === 'none').length,
  anchorShown: window.__cy.$id('structure_formation').style('display') !== 'none',
}));
await clickControl('Show confirmed');
await clickControl('Show all concepts');
await clickControl('Show all concepts');
await wait(800);
const viewAfter = await viewport();
const viewKept =
  Math.abs(viewAfter.zoom - viewBefore.zoom) < 1e-6 && Math.hypot(viewAfter.x - viewBefore.x, viewAfter.y - viewBefore.y) < 0.5;
console.log('view kept through the toggles:', viewKept);
if (!viewKept) errors.push(`a display toggle moved the view: ${JSON.stringify(viewBefore)} → ${JSON.stringify(viewAfter)}`);
console.log('layer toggles:', { proposedOff, overlayHidden, confirmedOff, ...context });
if (proposedOff !== 'false' || !overlayHidden) errors.push('"Show proposed" did not hide the proposed layer');
if (confirmedOff !== 'false' || context.hiddenConfirmed < 50 || !context.anchorShown)
  errors.push('"Show confirmed" did not hide confirmed concepts while keeping the ones proposals attach to');

// --- Community preview, Phase 2: the proposal editor ---
// Keyboard first (form + search alone), then the pointer (drag the ghost).
await page.evaluate(() => localStorage.removeItem('physics-atlas-proposal-drafts-v2'));
await page.goto(`${URL}/?mode=concepts&community=1`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__cy?.nodes('.overlay').length > 0, { timeout: 10000 });
await wait(500);
const beforeDraft = await confirmedPositions();
await page.focus('.concept-propose');
await page.keyboard.press('Enter');
await page.waitForSelector('.draft-editor', { timeout: 10000 });
await wait(300);
const editorFocused = await page.evaluate(() => document.activeElement?.classList.contains('draft-card'));
await page.focus('.draft-editor input.draft-input');
await page.keyboard.type('Smoke test concept');
await page.focus('.draft-search input');
await page.keyboard.type("Zel'dovich");
await wait(150);
await page.keyboard.press('Enter');
// The ghost glides next to its connection (0.4 s), then the view frames both (0.7 s).
await wait(1600);
const keyboardDraft = await page.evaluate(() => {
  const cy = window.__cy;
  const g = cy.nodes('.draft.draft-active').first();
  const p = g.position();
  const d = (n) => Math.hypot(n.position().x - p.x, n.position().y - p.y);
  const nearest = cy.nodes().not('.overlay, .draft').sort((a, b) => d(a) - d(b)).map((n) => n.id());
  return {
    rank: nearest.indexOf('zeldovich_approximation') + 1,
    draftEdges: cy.edges('.draft').length,
    suggestions: document.querySelector('.draft-suggestions')?.textContent ?? '',
  };
});
console.log('editor, keyboard:', { editorFocused, ...keyboardDraft });
if (!editorFocused) errors.push('opening the proposal editor did not move focus into it');
if (keyboardDraft.draftEdges !== 1 || keyboardDraft.rank < 1 || keyboardDraft.rank > 3)
  errors.push(`keyboard connection did not place the draft next to it: ${JSON.stringify(keyboardDraft)}`);
if (!keyboardDraft.suggestions.includes('Near what you connected'))
  errors.push('no suggestions from what the draft is connected to');

// Pointer: bring Structure Formation into view, drag the ghost next to it.
await page.evaluate(() => {
  const cy = window.__cy;
  const p = cy.$id('structure_formation').position();
  cy.pan({ x: 250 - p.x * cy.zoom(), y: 380 - p.y * cy.zoom() });
});
await wait(200);
const drag = await page.evaluate(() => {
  const r = document.querySelector('.graph-canvas').getBoundingClientRect();
  const g = window.__cy.nodes('.draft.draft-active').first().renderedPosition();
  return { x: r.x + g.x, y: r.y + g.y, tx: r.x + 330, ty: r.y + 470 };
});
await page.mouse.move(drag.x, drag.y);
await page.mouse.down();
for (let i = 1; i <= 15; i++) {
  await page.mouse.move(drag.x + ((drag.tx - drag.x) * i) / 15, drag.y + ((drag.ty - drag.y) * i) / 15);
  await wait(16);
}
await page.mouse.up();
await wait(400);
const offered = await page.$$eval('.draft-suggestion', (b) => b.map((x) => x.textContent.trim()));
await page.evaluate(() => [...document.querySelectorAll('.draft-suggestion')].find((b) => b.textContent.includes('Structure Formation'))?.click());
await wait(200);
await page.evaluate(() => window.__cy.$id('structure_formation').emit('tap'));
await wait(300);
const pointerDraft = await page.evaluate(() => ({
  relations: document.querySelectorAll('.draft-relation .draft-sentence').length,
  duplicate: [...document.querySelectorAll('.draft-warning')].some((w) => w.textContent.includes('already added this relation')),
  ghostLabel: window.__cy.nodes('.draft.draft-active').first().data('label'),
}));
const afterDraft = await confirmedPositions();
const movedByDraft = Object.keys(beforeDraft).filter(
  (id) => Math.hypot(afterDraft[id].x - beforeDraft[id].x, afterDraft[id].y - beforeDraft[id].y) > 0.5,
);
console.log('editor, pointer:', { offered, ...pointerDraft, confirmedMoved: movedByDraft.length });
if (!offered.some((o) => o.includes('Structure Formation'))) errors.push('dragging the draft next to Structure Formation did not offer it');
if (pointerDraft.relations !== 3 || !pointerDraft.duplicate) errors.push(`expected 3 relations and a duplicate warning: ${JSON.stringify(pointerDraft)}`);
if (movedByDraft.length) errors.push(`drafting moved confirmed concepts: ${movedByDraft.slice(0, 5).join(', ')}`);
await page.screenshot({ path: `${OUT}/community-draft.png` });

await page.evaluate(() => [...document.querySelectorAll('.draft-footer .draft-button')].find((b) => b.textContent.startsWith('Close')).click());
await wait(300);
const closed = await page.evaluate(() => ({
  ghostGone: window.__cy.nodes('.draft.draft-active').first().empty(),
  focusOnButton: document.activeElement?.classList.contains('concept-propose'),
  button: document.querySelector('.concept-propose')?.textContent,
}));
console.log('editor closed:', closed);
if (!closed.ghostGone || !closed.focusOnButton || !closed.button?.includes('Continue'))
  errors.push(`closing the editor: ${JSON.stringify(closed)}`);

// Several drafts: a second concept that relates to the first depends on it,
// and discarding the first removes that relation.
await page.click('.concept-propose');
await page.waitForSelector('.draft-editor');
await wait(300);
const firstGhost = await page.evaluate(() => window.__cy.nodes('.draft').map((n) => n.id())[0]);
await page.evaluate(() => [...document.querySelectorAll('.draft-chip-add')][0].click());
await wait(400);
await page.focus('.draft-editor input.draft-input');
await page.keyboard.type('Smoke dependent');
await page.evaluate((id) => window.__cy.$id(id).emit('tap'), firstGhost);
await wait(1600);
const dependent = await page.evaluate(() => ({
  ghosts: window.__cy.nodes('.draft').length,
  between: window.__cy.edges('.draft').filter((e) => e.source().hasClass('draft') && e.target().hasClass('draft')).length,
  deps: document.querySelector('.draft-deps')?.textContent ?? '',
}));
await page.evaluate(() => [...document.querySelectorAll('.draft-chip')].find((b) => b.textContent.includes('Smoke test concept')).click());
await wait(300);
await page.evaluate(() => [...document.querySelectorAll('.draft-footer .draft-button')].find((b) => b.textContent.startsWith('Discard')).click());
await wait(100);
await page.click('.draft-button-danger');
await wait(600);
const afterDiscard = await page.evaluate(() => ({
  ghosts: window.__cy.nodes('.draft').length,
  draftEdges: window.__cy.edges('.draft').length,
  status: document.querySelector('.draft-status')?.textContent ?? '',
}));
console.log('two drafts:', dependent, 'after discarding the first:', afterDiscard);
if (dependent.ghosts !== 2 || dependent.between !== 1 || !dependent.deps.includes('Add Smoke test concept'))
  errors.push(`a relation between two drafts didn't make a dependency: ${JSON.stringify(dependent)}`);
if (afterDiscard.ghosts !== 1 || afterDiscard.draftEdges !== 0 || !afterDiscard.status.includes('Removed 1 relation'))
  errors.push(`discarding a draft didn't remove the relation into it: ${JSON.stringify(afterDiscard)}`);

// Editing a confirmed concept: the same form, filled in; the concept previews the edit.
await page.evaluate(() => [...document.querySelectorAll('.draft-footer .draft-button')].find((b) => b.textContent.startsWith('Close')).click());
await wait(300);
await page.evaluate(() => window.__cy.$id('kinetic_theory').emit('tap'));
await page.waitForSelector('.map-card-edit', { timeout: 10000 });
await page.click('.map-card-edit');
await page.waitForSelector('.draft-editor');
await wait(400);
const editForm = await page.evaluate(() => ({
  title: document.querySelector('.draft-editor .map-card-title')?.textContent ?? '',
  name: document.querySelector('.draft-editor input.draft-input')?.value ?? '',
  subject: window.__cy.$id('kinetic_theory').hasClass('draft-subject'),
  existing: document.querySelectorAll('.draft-existing-list li').length,
}));
console.log('edit form:', editForm);
if (!editForm.title.includes('Propose an edit: Kinetic theory') || editForm.name !== 'Kinetic theory' || !editForm.subject)
  errors.push(`editing a concept: ${JSON.stringify(editForm)}`);
await page.evaluate(() => [...document.querySelectorAll('.draft-footer .draft-button')].find((b) => b.textContent.startsWith('Close')).click());
await page.evaluate(() => localStorage.removeItem('physics-atlas-proposal-drafts-v2'));

// --- Community, Phase 3: sign in and submit, against a simulated backend ---
// The dev server has no /api (that runs on Cloudflare), so the page answers
// it here; server/api.test.ts covers the backend itself.
const noBackend = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 300));
  return document.querySelector('.community-account')?.textContent ?? '';
});
const p3 = await browser.newPage();
await p3.setViewport({ width: 1440, height: 900 });
const sim = { user: null, proposals: [], submitted: null };
await p3.setRequestInterception(true);
p3.on('request', (req) => {
  const u = new globalThis.URL(req.url());
  if (!u.pathname.startsWith('/api/')) return req.continue();
  const reply = (data, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(data) });
  if (u.pathname === '/api/me') return reply({ configured: true, user: sim.user, invited: true });
  if (u.pathname === '/api/proposals' && req.method() === 'GET') return reply({ proposals: sim.proposals });
  if (u.pathname === '/api/proposals' && req.method() === 'POST') {
    sim.submitted = JSON.parse(req.postData());
    const pr = { number: 12, url: 'https://github.com/example/atlas-test/pull/12' };
    sim.proposals = [{ ...sim.submitted.proposal, author: { name: 'Ada L', handle: 'ada' }, pr }];
    return reply(pr, 201);
  }
  return reply({ error: 'Not found' }, 404);
});
await p3.evaluateOnNewDocument(() => localStorage.removeItem('physics-atlas-proposal-drafts-v2'));
await p3.goto(`${URL}/?mode=community`, { waitUntil: 'networkidle0' });
await p3.waitForSelector('.community-signin', { timeout: 10000 });
const signInHref = await p3.$eval('.community-signin', (a) => a.getAttribute('href'));
sim.user = { login: 'ada', id: 42, name: 'Ada L' };
await p3.reload({ waitUntil: 'networkidle0' });
await p3.waitForSelector('.community-account');
await p3.click('.concept-propose');
await p3.waitForSelector('.draft-editor');
const p3ids = await p3.$$eval('.draft-editor [id]', (els) => els.map((e) => e.id));
const p3field = (end) => p3ids.find((i) => i.endsWith('-' + end) && !i.endsWith('h-' + end));
await p3.type(`[id="${p3field('label')}"]`, 'Smoke submitted concept');
await p3.select(`[id="${p3field('type')}"]`, 'property');
await p3.type(`[id="${p3field('description')}"]`, 'Sample: a smoke-test concept.');
await p3.focus('.draft-search input');
await p3.keyboard.type('Structure Form');
await wait(150);
await p3.keyboard.press('Enter');
await wait(1600);
await p3.evaluate(() => [...document.querySelectorAll('.draft-submit button')].find((b) => b.textContent.includes('Submit as a pull request'))?.click());
await wait(1500);
const submitted = await p3.evaluate(() => ({
  editorOpen: Boolean(document.querySelector('.draft-editor')),
  proposals: window.__cy.nodes('.overlay').map((n) => n.data('label')),
  account: document.querySelector('.community-account')?.textContent ?? '',
}));
console.log('phase 3 (simulated backend):', {
  noBackend: noBackend.includes('sample'),
  signInHref,
  sent: sim.submitted?.proposal.title,
  ...submitted,
});
if (!noBackend.includes('sample')) errors.push('without a backend the community view should say it shows sample proposals');
if (signInHref !== '/api/auth/login?return=%2F%3Fmode%3Dcommunity') errors.push(`sign-in link: ${signInHref}`);
if (sim.submitted?.proposal.title !== 'Add Smoke submitted concept') errors.push('the submitted proposal did not reach the backend');
if (submitted.editorOpen || !submitted.proposals.some((l) => l.startsWith('Smoke submitted concept')) || !submitted.account.includes('#12'))
  errors.push(`after submitting: ${JSON.stringify(submitted)}`);
await p3.close();

// --- Atlas pages: a page per concept, reached from the card, read in order ---
const p4 = await browser.newPage();
p4.on('pageerror', (e) => errors.push(`atlas pages: ${e.message}`));
await p4.setViewport({ width: 1440, height: 900 });
await p4.goto(`${URL}/?mode=concepts`, { waitUntil: 'networkidle0' });
await p4.evaluate(() => window.__cy.$id('einstein_eq').emit('tap'));
await wait(800);
await p4.click('.map-card-page');
await p4.waitForSelector('.atlas-page h1');
await wait(300);
const pageState = () =>
  p4.evaluate(() => ({
    url: location.search,
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.trim()),
    focused: document.activeElement?.id,
    current: document.querySelector('.atlas-sidebar [aria-current="page"]')?.textContent.trim(),
  }));
const fromCard = await pageState();
await p4.click('.atlas-pagenav a[rel="next"]');
await wait(300);
const afterNext = await pageState();
await p4.click('input[name="atlas-view"][value="neighbours"]');
await wait(150);
const neighbourLinks = await p4.$$eval('.atlas-neighbours a', (as) => as.length);
console.log('atlas pages:', { fromCard, afterNext: afterNext.url, neighbourLinks });
if (fromCard.url !== '?mode=page&concept=einstein_eq' || fromCard.h1.length !== 1 || fromCard.h1[0] !== 'Einstein Field Equations')
  errors.push(`the card's page link: ${JSON.stringify(fromCard)}`);
if (!fromCard.title.startsWith('Einstein Field Equations —') || !fromCard.current?.endsWith('Einstein Field Equations'))
  errors.push(`the page's title or contents marker: ${JSON.stringify(fromCard)}`);
if (afterNext.url === fromCard.url || afterNext.focused !== 'atlas-page-title')
  errors.push(`Next didn't move to a new page with focus on its heading: ${JSON.stringify(afterNext)}`);
if (neighbourLinks === 0) errors.push("the Neighbours view lists nothing for a page that's connected");
await p4.screenshot({ path: `${OUT}/atlas-page.png` });
await p4.close();

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
