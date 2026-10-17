#!/usr/bin/env node
// Browser smoke test: drives the running dev server (npm run dev) with
// puppeteer-core + installed Chrome. Ticks curriculum steps, checks progress
// persistence and console errors. Screenshots go to SMOKE_OUT (default /tmp).
import puppeteer from 'puppeteer-core';

const OUT = process.env.SMOKE_OUT ?? '/tmp';
const URL = process.env.DEV_URL ?? 'http://localhost:5173';
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

await page.goto(`${URL}/?mode=goal`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.curriculum-check');

const boxes = await page.$$('.curriculum-check');
for (const box of boxes.slice(0, 3)) await box.click();
await new Promise((r) => setTimeout(r, 600));

console.log(
  'sidebar-count after 3 ticks:',
  await page.$eval('.sidebar-count', (el) => el.textContent),
);
console.log(
  'localStorage:',
  await page.evaluate(() => localStorage.getItem('physics-atlas-progress-v1')),
);
await page.screenshot({ path: `${OUT}/goal-3done.png` });

await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.sidebar-count');
console.log('after reload:', await page.$eval('.sidebar-count', (el) => el.textContent));

await page.goto(`${URL}/?mode=explore`, { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${OUT}/explore-3done.png` });

// --- Search: type, pick via Enter, expect selection + detail panel ---
await page.click('.search-input');
await page.type('.search-input', 'quantum');
await page.waitForSelector('.search-result');
const firstResult = await page.$eval('.search-result', (el) => el.textContent);
console.log('search "quantum" first result:', firstResult?.trim());
await page.keyboard.press('Enter');
await page.waitForSelector('.learned-toggle');
console.log(
  'map card after search:',
  await page.$eval('.map-card-title', (el) => el.textContent?.trim()),
);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: `${OUT}/explore-search.png` });

// --- Search in goal mode for a topic outside the current goal's subgraph ---
await page.goto(`${URL}/?mode=goal`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.curriculum-check');
// Make Special Relativity the goal, then search for Cosmology (outside it)
await page.click('.goal-chip'); // first chip = Special Relativity
await new Promise((r) => setTimeout(r, 300));
const before = await page.$eval('.sidebar-title', (el) => el.textContent?.trim());
await page.click('.search-input');
await page.type('.search-input', 'cosmo');
await page.waitForSelector('.search-result');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 500));
const after = await page.$eval('.sidebar-title', (el) => el.textContent?.trim());
console.log('goal before search:', before, '→ after searching "cosmo":', after);

// --- Content-type filter: the searched topic's detail is already open ---
await page.waitForSelector('.content-filter');
const allCount = await page.$$eval('.content-item', (els) => els.length);
await page.$$eval('.filter-chip', (chips) => {
  chips.find((c) => c.textContent.includes('book'))?.click();
});
await new Promise((r) => setTimeout(r, 200));
const bookCount = await page.$$eval('.content-item', (els) => els.length);
console.log(`content filter: ${allCount} items → ${bookCount} after "book" chip`);
await page.screenshot({ path: `${OUT}/goal-filter.png` });

// --- Home page: galaxy hero, search leads to the full map ---
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.home .search-input');
console.log('home hero title:', await page.$eval('.home-title', (el) => el.textContent?.trim()));
await page.click('.home .search-input');
await page.type('.home .search-input', 'general rel');
await page.waitForSelector('.search-result');
await page.keyboard.press('Enter');
await page.waitForSelector('.map-card');
console.log(
  'map card after home search:',
  await page.$eval('.map-card-title', (el) => el.textContent?.trim()),
);
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${OUT}/map-focused.png` });

// --- Build curriculum from the map card ---
await page.click('.map-card-goal');
await page.waitForSelector('.curriculum');
console.log(
  'after "Build curriculum":',
  await page.$eval('.sidebar-title', (el) => el.textContent?.trim()),
);

// --- Optional steps: badges, toggle, and print sheet ---
await page.goto(`${URL}/?mode=goal&goal=quantum-mechanics`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.curriculum-check');
const badges = await page.$$eval('.optional-badge', (els) => els.length);
const beforeCount = await page.$eval('.sidebar-count', (el) => el.textContent);
const beforeItems = await page.$$eval('.curriculum-item', (els) => els.length);
await page.click('.optional-toggle input');
await new Promise((r) => setTimeout(r, 300));
const afterCount = await page.$eval('.sidebar-count', (el) => el.textContent);
const afterItems = await page.$$eval('.curriculum-item', (els) => els.length);
console.log(
  `optional: ${badges} badge(s); items ${beforeItems}→${afterItems}; count ${beforeCount} → ${afterCount}`,
);
if (badges === 0 || afterItems >= beforeItems) errors.push('optional toggle did not reduce the curriculum');
await page.click('.optional-toggle input');

// --- Print sheet: print media shows the sheet, hides the app, renders a PDF ---
await page.emulateMediaType('print');
const printDisplay = await page.$eval('.print-sheet', (el) => getComputedStyle(el).display);
const workspaceDisplay = await page.$eval('.workspace', (el) => getComputedStyle(el).display);
console.log(`print media: print-sheet=${printDisplay}, workspace=${workspaceDisplay}`);
if (printDisplay !== 'block' || workspaceDisplay !== 'none') errors.push('print CSS not applied');
await page.pdf({ path: `${OUT}/curriculum.pdf`, format: 'A4' });
console.log(`wrote ${OUT}/curriculum.pdf`);
await page.emulateMediaType('screen');

// --- Topic page: content, relations map, and its own PDF sheet ---
await page.goto(`${URL}/?mode=topic&id=quantum-mechanics`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.topic-page-title');
const goalItems = await page.$$eval('.learning-goal-item', (els) => els.length);
console.log(
  'topic page:',
  await page.$eval('.topic-page-title', (el) => el.textContent?.trim()),
  `· ${goalItems} learning goals`,
);
if (goalItems !== 8) errors.push(`expected 8 QM learning goals, got ${goalItems}`);

// The topic's own subgoals (migrated from objectives) are tickable inline
const topicSubgoals = await page.$$eval('.subgoal-row input[type=checkbox]', (els) => els.length);
console.log(`topic-level subgoals: ${topicSubgoals}`);
if (topicSubgoals !== 3) errors.push(`expected 3 topic-level subgoals, got ${topicSubgoals}`);

// Opening a learning goal pops the side panel with its own subgoals
await page.click('.learning-goal-button');
await page.waitForSelector('.subtopic-panel');
const panelTitle = await page.$eval('.subtopic-panel-title', (el) => el.textContent?.trim());
const panelSubgoals = await page.$$eval(
  '.subtopic-panel .subgoal-row input[type=checkbox]',
  (els) => els.length,
);
console.log(`side panel: "${panelTitle}" with ${panelSubgoals} subgoals`);
if (panelSubgoals < 1) errors.push('side panel has no subgoals');
await page.click('.subtopic-panel .subgoal-row input[type=checkbox]');
await new Promise((r) => setTimeout(r, 250));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.learning-goal-button');
await page.click('.learning-goal-button');
await page.waitForSelector('.subtopic-panel');
const panelPersisted = await page.$eval(
  '.subtopic-panel .subgoal-row input[type=checkbox]',
  (el) => el.checked,
);
console.log('panel subgoal tick persisted:', panelPersisted);
if (!panelPersisted) errors.push('panel subgoal tick did not persist');

// Escape closes the panel
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 250));
const panelClosed = (await page.$('.subtopic-panel')) === null;
console.log('Escape closes panel:', panelClosed);
if (!panelClosed) errors.push('Escape did not close the side panel');

// Clicking a learning goal in the relations map also opens the panel
// (cytoscape draws to canvas, so drive it through the dev-only handle)
const treeSubNodes = await page.evaluate(
  () => window.__cy?.nodes().map((n) => n.id()).filter((id) => id.startsWith('quantum-mechanics/')).length ?? 0,
);
await page.evaluate(() => window.__cy.$id('quantum-mechanics/spin').emit('tap'));
await new Promise((r) => setTimeout(r, 350));
const fromTree = await page
  .$eval('.subtopic-panel-title', (el) => el.textContent?.trim())
  .catch(() => null);
console.log(`tree: ${treeSubNodes} learning-goal nodes; tapping "spin" opened panel "${fromTree}"`);
if (treeSubNodes !== 8) errors.push(`expected 8 learning-goal nodes in the tree, got ${treeSubNodes}`);
if (fromTree !== 'Spin') errors.push('clicking a learning goal in the tree did not open its panel');
await page.keyboard.press('Escape');

await page.emulateMediaType('print');
const tpSheet = await page.$eval('.print-sheet', (el) => getComputedStyle(el).display);
const tpInner = await page.$eval('.topic-page-inner', (el) => getComputedStyle(el).display);
console.log(`topic print media: print-sheet=${tpSheet}, topic-page-inner=${tpInner}`);
if (tpSheet !== 'block' || tpInner !== 'none') errors.push('topic-page print CSS not applied');
await page.pdf({ path: `${OUT}/topic-quantum-mechanics.pdf`, format: 'A4' });
console.log(`wrote ${OUT}/topic-quantum-mechanics.pdf`);
await page.emulateMediaType('screen');

// --- A topic whose learning goals live in its sub-areas still shows them ---
await page.goto(`${URL}/?mode=topic&id=differential-geometry`, { waitUntil: 'networkidle0' });
await page.waitForSelector('.learning-goal-item');
const dgAreas = await page.$$eval('.learning-goal-area-head', (els) =>
  els.map((e) => e.textContent?.replace('open →', '').trim()),
);
const dgGoals = await page.$$eval('.learning-goal-item', (els) => els.length);
console.log(`differential-geometry: ${dgGoals} learning goals in ${dgAreas.length} sub-areas`);
if (dgAreas.length !== 4) errors.push(`expected 4 diff-geo sub-areas, got ${dgAreas.length}`);
if (dgGoals !== 13) errors.push(`expected 13 diff-geo learning goals, got ${dgGoals}`);
await page.click('.learning-goal-area .learning-goal-button');
await page.waitForSelector('.subtopic-panel');
const dgOwner = await page.$eval('.subtopic-panel-parent', (el) => el.textContent?.trim());
console.log(`  panel from a sub-area goal: ${dgOwner}`);
if (!/Tangent Spaces/i.test(dgOwner ?? ''))
  errors.push('sub-area learning goal did not open with its own owner');

// --- Learning-goal detail: subgoals as checkboxes, prerequisite areas, and
//     one-click promotion of a prerequisite into the main goal ---
await page.goto(`${URL}/?mode=goal&goal=general-relativity/parallel-transport`, {
  waitUntil: 'networkidle0',
});
await page.waitForSelector('.subgoal-checklist');
const subgoalCount = await page.$$eval(
  '.subgoal-checklist',
  (lists) => lists[0]?.querySelectorAll('.subgoal-row').length ?? 0,
);
const areaGroups = await page.$$eval('.curriculum-group-name', (els) =>
  els.map((e) => e.textContent?.trim()),
);
console.log(
  `parallel transport: ${subgoalCount} subgoals, ${areaGroups.length} prerequisite areas (${areaGroups.join(', ')})`,
);
if (subgoalCount !== 5) errors.push(`expected 5 subgoals, got ${subgoalCount}`);
if (areaGroups.length < 6) errors.push(`expected >=6 prerequisite areas, got ${areaGroups.length}`);

// Tick the goal's first subgoal, reload, expect it to persist
await page.click('.subgoal-checklist .subgoal-row input');
await new Promise((r) => setTimeout(r, 300));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('.subgoal-checklist');
const persisted = await page.$eval('.subgoal-checklist .subgoal-row input', (el) => el.checked);
console.log('subgoal tick persisted across reload:', persisted);
if (!persisted) errors.push('subgoal tick did not persist across reload');

// Subgoals reach the printed sheet as checkboxes
await page.emulateMediaType('print');
const printSubgoals = await page.$$eval('.print-subgoals li', (els) =>
  els.map((e) => e.textContent?.trim()),
);
console.log(`print sheet subgoals: ${printSubgoals.length} (e.g. "${printSubgoals[0] ?? ''}")`);
if (printSubgoals.length < 5) errors.push('print sheet is missing the subgoal checkboxes');
if (printSubgoals[0] && !/^[☑☐]/.test(printSubgoals[0]))
  errors.push('print subgoals are not rendered as checkboxes');
await page.emulateMediaType('screen');

// Promote a prerequisite learning goal into the main goal
await page.click('.curriculum-head'); // open the first step's detail
await page.waitForSelector('.promote-goal');
const beforeTitle = await page.$eval('.sidebar-title', (el) => el.textContent?.trim());
await page.click('.promote-goal');
await new Promise((r) => setTimeout(r, 400));
const afterTitle = await page.$eval('.sidebar-title', (el) => el.textContent?.trim());
console.log(`promotion: "${beforeTitle}" → "${afterTitle}"`);
if (beforeTitle === afterTitle) errors.push('promoting a prerequisite did not change the goal');

// --- Home → Explore now lands on the concept map, not the topic full map ---
await page.goto(`${URL}/`, { waitUntil: 'networkidle0' });
await page.click('.home-explore');
await new Promise((r) => setTimeout(r, 600));
const exploreSearch = await page.evaluate(() => window.location.search);
console.log('home-explore search:', exploreSearch);
if (!exploreSearch.startsWith('?mode=concepts'))
  errors.push(`expected home-explore to land on ?mode=concepts, got ${exploreSearch}`);
const exploreNodeCount = await page.evaluate(() => window.__cy?.nodes().length ?? 0);
if (exploreNodeCount !== 64)
  errors.push(`expected 64 concept nodes after home-explore, got ${exploreNodeCount}`);
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
if (conceptCounts.nodes !== 64 || conceptCounts.edges !== 66)
  errors.push(`expected 64 concept nodes / 66 edges, got ${conceptCounts.nodes}/${conceptCounts.edges}`);
await page.evaluate(() => window.__cy.$id('einstein_eq').emit('tap'));
await page.waitForSelector('.map-card');
const conceptCard = await page.$eval('.map-card', (el) => el.textContent ?? '');
console.log('concept card has "leads to Newtonian Gravity":', conceptCard.includes('leads to Newtonian Gravity'));
if (!conceptCard.includes('leads to Newtonian Gravity'))
  errors.push('concept card is missing the einstein_eq → newtonian gravity relation sentence');
await page.screenshot({ path: `${OUT}/concepts.png` });

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

// The confirmed layout first settles and is cached; then the same map with proposals.
await page.goto(`${URL}/?mode=concepts`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => Boolean(localStorage.getItem('physics-atlas-concept-layout-v6')), { timeout: 60000 });
await page.reload({ waitUntil: 'networkidle0' });
await wait(500);
const layoutBefore = await confirmedPositions();
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

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
