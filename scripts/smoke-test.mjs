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

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
