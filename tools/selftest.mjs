import { analyzeModel, normalizeDump } from '../src/model.js';
import { analyze } from '../src/analysis.js';
import { diffDumps, isEmptyDiff } from '../src/diff.js';
import { buildReport, reportFileName } from '../src/report.js';

const NOW = Date.parse('2026-10-01T09:00:00.000Z');

const realistic = {
  schemaVersion: 1,
  generatedAt: '2026-09-29T08:12:04.512Z',
  buildStamp: 'nightly',
  app: { name: 'otherplanner', version: '2.3.1', electronVersion: '39.0.2', chromeVersion: '142.0.1.0', nodeVersion: '22.9.0', channel: 'stable' },
  system: { platform: 'linux', architecture: 'arm64', osRelease: '6.11.0', totalMemoryBytes: 34359738368, cpuCount: 8, locale: 'en-GB', gpu: 'none' },
  configuration: { runMode: 'console', modsPath: '/home/dev/sd/ultimate/mods', pluginsPath: '/home/dev/sd/atmosphere/contents/01006A800016E000/romfs/skyline/plugins', notes: 'hand built' },
  libraries: {
    mods: {
      configured: true,
      activeCount: 3,
      disabledCount: 1,
      items: [
        { name: 'Fox Rework', folderName: 'Fox Rework', status: 'active', version: '3.2', authors: 'someone', category: 'Moveset', sourceUrl: 'https://gamebanana.com/mods/123456' },
        { name: 'Stage Pack', folderName: 'Stage Pack', status: 'active', version: '1.0', authors: 'someone else', category: 'Stage', sourceUrl: 'https://example.org/stage-pack.7z' },
        { name: 'UI Skin', folderName: 'UI Skin', status: 'disabled', version: null, authors: null, category: 'UI', sourceUrl: null },
        { name: 'Plain Folder', folderName: 'Plain Folder', status: 'unknown', version: '0.1', authors: 'anon', category: 'Misc', sourceUrl: null }
      ]
    },
    plugins: {
      configured: true,
      scanError: 'Cannot access plugins directory',
      items: [
        { name: 'libarcropolis.nro', status: 'active', size: '812 kB', version: 'file.nro', repository: 'https://codeberg.org/somewhere/arcropolis', sourceUrl: null },
        { name: 'libsmashline.nro', status: 'disabled', size: '240 kB', version: '1.4.2', repository: null, sourceUrl: null }
      ]
    }
  }
};

const minimal = { schemaVersion: 1 };

const mistyped = {
  schemaVersion: 'one',
  generatedAt: 'whenever',
  app: 'nope',
  system: { platform: 42, totalMemoryBytes: 'lots', cpuCount: 'many' },
  configuration: {},
  libraries: {
    mods: { items: { first: { name: 'A', folderName: null, status: true }, second: { name: '', folderName: 'B' } } },
    plugins: { items: null }
  },
  surprise: { nested: true }
};

const notAnObject = [{ schemaVersion: 1 }];

const cases = [
  { label: 'unrelated dump', raw: realistic, fileName: 'mosaic-debug-other.json' },
  { label: 'minimal dump', raw: minimal, fileName: 'minimal.json' },
  { label: 'mis-typed dump', raw: mistyped, fileName: 'mistyped.json' },
  { label: 'json array', raw: notAnObject, fileName: 'array.json' },
  { label: 'empty object', raw: {}, fileName: 'empty.json' },
  { label: 'raw text', raw: 'not json at all', fileName: 'text.json' }
];

const failures = [];
const results = [];

for (const testCase of cases) {
  let model;
  let analysis;
  let report;
  try {
    model = normalizeDump(testCase.raw, testCase.fileName);
    analyzeModel(model);
    analysis = analyze(model, NOW);
    report = buildReport(model, analysis, NOW);
  } catch (error) {
    failures.push(`${testCase.label}: threw ${error && error.message}`);
    continue;
  }
  const mods = model.libraries.mods.items.length;
  const plugins = model.libraries.plugins.items.length;
  if (!analysis.findings.length) failures.push(`${testCase.label}: no checks ran`);
  if (analysis.findings.some((finding) => finding.rule === 'category-spread')) failures.push(`${testCase.label}: category-spread should not be reported`);
  const missingSource = analysis.findings.find((finding) => finding.rule === 'missing-source');
  if (missingSource && (missingSource.severity !== 'info' || /prevent them from loading|loading problem/i.test(`${missingSource.why} ${missingSource.impact}`) === false)) failures.push(`${testCase.label}: missing source should be context-only and not imply a load failure`);
  if (!['critical', 'warning', 'info', 'ok'].every((severity) => Number.isFinite(analysis.signals.counts[severity]) && analysis.signals.counts[severity] >= 0)) failures.push(`${testCase.label}: invalid signal counts`);
  if (typeof report !== 'string' || report.length < 80) failures.push(`${testCase.label}: report is empty`);
  if (/undefined|\[object Object\]/.test(report)) failures.push(`${testCase.label}: report leaked undefined`);
  if (/^\s*(?:Fix|What to do)\s*:/im.test(report)) failures.push(`${testCase.label}: report included a fix recommendation`);
  if (!report.includes('investigation leads, not confirmed causes')) failures.push(`${testCase.label}: report omitted the investigation context`);
  if (!reportFileName(model).endsWith('.md')) failures.push(`${testCase.label}: bad report file name`);
  results.push({
    case: testCase.label,
    mods,
    plugins,
    critical: analysis.signals.counts.critical,
    warning: analysis.signals.counts.warning,
    notes: analysis.signals.counts.info,
    checks: analysis.findings.length,
    cautions: model.notes.length
  });
}

const base = analyzeModel(normalizeDump(cases[0].raw, cases[0].fileName));
const next = analyzeModel(normalizeDump(cases[1].raw, cases[1].fileName));
const baseAnalysis = analyze(base, NOW);
const nextAnalysis = analyze(next, NOW);
let diff;
try {
  diff = diffDumps(base, next, baseAnalysis, nextAnalysis);
  if (isEmptyDiff(diff)) failures.push('cross-dump diff: two unrelated dumps reported as identical');
} catch (error) {
  failures.push(`cross-dump diff: threw ${error && error.message}`);
}

console.table(results);
if (diff) {
  const s = diff.summary;
  console.log(`diff ${cases[0].label} → ${cases[1].label}: ${s.mods.added} mods added, ${s.mods.removed} removed, ${s.mods.changed} changed, ${s.plugins.added} plugins added, ${s.findings.new} signals appeared, ${s.findings.resolved} no longer matched, signals ${s.findings.baseSignals} → ${s.findings.nextSignals}`);
}

const sharedSourceRaw = {
  schemaVersion: 1,
  libraries: {
    mods: {
      items: [
        { name: 'Darkness Sonic', folderName: 'Darkness Sonic', status: 'active', sourceUrl: 'https://gamebanana.com/mmdl/1647819,Mod,660167,rar' },
        { name: 'Sonic Victory Animation', folderName: 'Sonic Victory Animation', status: 'active', sourceUrl: 'https://gamebanana.com/mmdl/1647819,Mod,660167,rar' },
        { name: 'Stage Boss Stage', folderName: 'Stage Boss Stage', status: 'active', sourceUrl: 'https://gamebanana.com/mmdl/813765?toolid=17950,Mod,374376,rar' },
        { name: 'Peachs Castle Stage', folderName: 'Peachs Castle Stage', status: 'active', sourceUrl: 'https://gamebanana.com/mmdl/813765?toolid=17950,Mod,374376,rar' }
      ]
    }
  }
};
const sharedSourceModel = analyzeModel(normalizeDump(sharedSourceRaw, 'shared-source.json'));
const sharedSourceAnalysis = analyze(sharedSourceModel, NOW);
if (sharedSourceAnalysis.findings.some((finding) => ['shared-source', 'active-conflict', 'url-variants'].includes(finding.id))) failures.push('source metadata: shared IDs and URL formats should not be reported as signals');
if (sharedSourceModel.libraries.mods.items.some((mod) => mod.flags.has('shared-source') || mod.flags.has('shared-source-odd'))) failures.push('shared source records: should not add per-mod source warning flags');
if (sharedSourceAnalysis.findings.some((finding) => finding.rule === 'source-url-variants')) failures.push('source URL formats: should not be reported as a finding');

if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${cases.length} dumps read, analysed and reported without a failure.`);
}
