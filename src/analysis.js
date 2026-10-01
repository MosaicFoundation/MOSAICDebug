import { SEVERITY_RANK, CORE_PLUGINS, formatBytes, formatNumber, formatRelative, pathTraits, dirname } from './model.js';

export const FAMILIES = [
  { id: 'schema', label: 'Dump integrity', icon: 'fact_check' },
  { id: 'duplicates', label: 'Duplicates', icon: 'copy_all' },
  { id: 'sources', label: 'Source records', icon: 'link' },
  { id: 'metadata', label: 'Metadata', icon: 'label' },
  { id: 'configuration', label: 'Configuration', icon: 'tune' },
  { id: 'plugins', label: 'Plugins', icon: 'memory' },
  { id: 'system', label: 'System', icon: 'devices' }
];

export const FAMILY_LABEL = Object.fromEntries(FAMILIES.map((family) => [family.id, family.label]));
export const FAMILY_ICON = Object.fromEntries(FAMILIES.map((family) => [family.id, family.icon]));

const KNOWN_TOP_LEVEL = ['schemaVersion', 'generatedAt', 'app', 'system', 'configuration', 'libraries'];

const modSubject = (mod) => ({
  type: 'mod',
  id: mod.id,
  label: mod.name,
  detail: mod.folderName,
  status: mod.status
});

const pluginSubject = (plugin) => ({
  type: 'plugin',
  id: plugin.id,
  label: plugin.name,
  detail: plugin.version || plugin.size || null,
  status: plugin.status
});

function listSubjects(items) {
  return items.slice(0, 500).map((item) => (item.kind === 'plugin' ? pluginSubject(item) : modSubject(item)));
}

function makeFinding(spec) {
  return {
    family: 'schema',
    severity: 'info',
    subjects: [],
    evidence: [],
    groups: [],
    links: [],
    ...spec,
    count: spec.count ?? spec.subjects.length
  };
}

function groupCounts(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key === null || key === undefined) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function buildFindings(model, now) {
  const findings = [];
  const mods = model.libraries.mods;
  const plugins = model.libraries.plugins;
  const modItems = mods.items;
  const pluginItems = plugins.items;
  const activeMods = modItems.filter((mod) => mod.status === 'active');
  const activePlugins = pluginItems.filter((plugin) => plugin.status === 'active');

  for (const note of model.notes) {
    findings.push(makeFinding({
      id: `schema:${note.path}`,
      rule: 'schema-caution',
      family: 'schema',
      severity: note.level,
      title: note.message,
      summary: `Field ${note.path}`,
      why: 'The reader expects the documented v1 layout. A missing or malformed field usually means the dump was truncated, written by an older build, or hand-edited.',
      impact: 'Anything the reader cannot parse is invisible here, so a report built on it may point at the wrong cause.',
      fix: 'Regenerate the dump from the app, then reload the fresh file here.',
      count: 1,
      evidence: [{ label: 'Path', value: note.path, mono: true }]
    }));
  }

  for (const [label, library, items] of [['mods', mods, modItems], ['plugins', plugins, pluginItems]]) {
    if (library.scanError) {
      findings.push(makeFinding({
        id: `scan-error:${label}`,
        rule: 'scan-error',
        family: 'schema',
        severity: 'critical',
        title: `The ${label} scan reported an error`,
        summary: 'The scan did not finish cleanly',
        why: 'A scan error means the inventory in this dump is incomplete: some folders or files were never read.',
        impact: `Counts and duplicates below are computed from a partial ${label} list, so missing entries can hide real conflicts.`,
        fix: 'Fix the reported error (usually a locked folder, a permission issue or a broken archive), then regenerate the dump.',
        count: 1,
        evidence: [{ label: 'scanError', value: library.scanError, mono: true }]
      }));
    }

    if (library.configured === false && items.length) {
      findings.push(makeFinding({
        id: `not-configured:${label}`,
        rule: 'library-not-configured',
        family: 'configuration',
        severity: 'warning',
        title: `${label} are marked as not configured but ${formatNumber(items.length)} entries are listed`,
        summary: 'Configuration flag contradicts the inventory',
        why: 'The configuration reports this library as off while the scan still collected entries.',
        impact: 'The app may ignore everything listed here while the dump makes it look active.',
        fix: `Point the ${label} path at the right folder in the app settings, or clear the leftover folder on disk.`,
        count: items.length
      }));
    }

    if (library.configured === true && !items.length) {
      findings.push(makeFinding({
        id: `empty-library:${label}`,
        rule: 'library-empty',
        family: 'configuration',
        severity: 'info',
        title: `${label} are configured but the list is empty`,
        summary: 'Nothing to load',
        why: 'The path is set, so the app will read the folder, but no entry was found.',
        impact: 'A typo in the path or a wrong subfolder looks exactly like an empty install.',
        fix: 'Check that the configured path really contains the expected folders.',
        count: 1
      }));
    }

    if (library.activeCount !== null && library.activeCount !== library.counts.active) {
      findings.push(makeFinding({
        id: `count-active:${label}`,
        rule: 'count-mismatch',
        family: 'schema',
        severity: 'warning',
        title: `Active ${label} count disagrees with the listed entries`,
        summary: `Reported ${formatNumber(library.activeCount)}, listed ${formatNumber(library.counts.active)}`,
        why: 'The summary counters and the item list come from the same scan, so they should always agree.',
        impact: 'A stale counter makes the app show a different number than the one you are debugging, and hides entries that were never listed.',
        fix: 'Regenerate the dump; if it still disagrees, the counter is updated in a code path the scan does not.',
        count: Math.abs(library.activeCount - library.counts.active),
        evidence: [
          { label: 'activeCount field', value: String(library.activeCount), mono: true },
          { label: 'active entries', value: String(library.counts.active), mono: true }
        ]
      }));
    }

    if (library.disabledCount !== null && library.disabledCount !== library.counts.disabled) {
      findings.push(makeFinding({
        id: `count-disabled:${label}`,
        rule: 'count-mismatch',
        family: 'schema',
        severity: 'warning',
        title: `Disabled ${label} count disagrees with the listed entries`,
        summary: `Reported ${formatNumber(library.disabledCount)}, listed ${formatNumber(library.counts.disabled)}`,
        why: 'Summary counters and the item list should always agree.',
        impact: 'One of the two numbers is wrong, and any count-based decision reads the wrong value.',
        fix: 'Regenerate the dump and compare again.',
        count: Math.abs(library.disabledCount - library.counts.disabled),
        evidence: [
          { label: 'disabledCount field', value: String(library.disabledCount), mono: true },
          { label: 'disabled entries', value: String(library.counts.disabled), mono: true }
        ]
      }));
    }

    const badStatus = items.filter((entry) => entry.status !== 'active' && entry.status !== 'disabled');
    if (badStatus.length) {
      findings.push(makeFinding({
        id: `bad-status:${label}`,
        rule: 'unknown-status',
        family: 'schema',
        severity: 'critical',
        title: `${formatNumber(badStatus.length)} ${label} have no usable status`,
        summary: 'Status is neither active nor disabled',
        why: 'More than two states means a write is bypassing the normal toggle, so the app and the dump no longer agree.',
        impact: 'These entries count as neither active nor disabled and can silently vanish from both lists.',
        fix: 'Re-enable or re-disable each entry from the app, then regenerate the dump.',
        count: badStatus.length,
        subjects: listSubjects(badStatus),
        evidence: [...new Set(badStatus.map((entry) => entry.status === null ? '(missing)' : String(entry.status)))].map((value) => ({ label: 'status value', value, mono: true }))
      }));
    }
  }

  const unknownKeys = Object.keys(model.raw || {}).filter((key) => !KNOWN_TOP_LEVEL.includes(key));
  if (unknownKeys.length) {
    findings.push(makeFinding({
      id: 'unknown-keys',
      rule: 'unknown-top-level',
      family: 'schema',
      severity: 'info',
      title: `${formatNumber(unknownKeys.length)} top-level field${unknownKeys.length === 1 ? '' : 's'} this reader does not know`,
      summary: 'Possibly a newer schema',
      why: 'Unknown fields are kept in the raw view but never analysed.',
      impact: 'If a newer build writes data the reader ignores, the cause of a bug can be invisible here.',
      fix: 'Open the raw dump tab and check the unknown fields before concluding anything.',
      count: unknownKeys.length,
      evidence: unknownKeys.map((key) => ({ label: 'field', value: key, mono: true }))
    }));
  }

  const batchCopies = modItems.filter((mod) => mod.flags.has('batch-duplicate'));
  if (batchCopies.length) {
    const activeCopies = batchCopies.filter((mod) => mod.status === 'active');
    const groupMap = groupCounts(batchCopies, (mod) => mod.batchBase.trim().toLowerCase());
    const timestamps = batchCopies.map((mod) => mod.batch.timestamp).filter(Number.isFinite);
    const span = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;
    findings.push(makeFinding({
      id: 'batch-duplicates',
      rule: 'batch-duplicate',
      family: 'duplicates',
      severity: activeCopies.length ? 'critical' : 'warning',
      title: `${formatNumber(batchCopies.length)} folders are batch copies across ${formatNumber(groupMap.size)} mods`,
      summary: activeCopies.length ? `${formatNumber(activeCopies.length)} of them are active` : 'All of them are disabled',
      why: 'The dump lists additional folders with the same underlying mod name. This can be consistent with a batch import copying an existing mod instead of replacing its folder.',
      impact: activeCopies.length
        ? 'The inventory lists multiple copies of the same mod, so the dump alone may not show which copy was selected during loading.'
        : 'The dump lists more folders than distinct mods, which may affect inventory counts and help identify the import history.',
      investigation: 'Compare the listed folders and import history to confirm whether a batch import created repeated copies.',
      count: batchCopies.length,
      subjects: listSubjects(batchCopies),
      evidence: [
        { label: 'Copies', value: formatNumber(batchCopies.length) },
        { label: 'Mods affected', value: formatNumber(groupMap.size) },
        { label: 'Import window', value: span ? `${Math.round(span / 1000)} s` : 'single timestamp', mono: false }
      ],
      groups: [...groupMap.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .slice(0, 40)
        .map(([key, items]) => ({
          label: items[0].batchBase || key,
          meta: `${items.length} copies`,
          items: listSubjects(items),
          note: items[0].batch ? `import ${items[0].batch.timestamp}` : null
        }))
    }));
  }

  const duplicateFolders = [...groupCounts(modItems, (mod) => mod.folderName.trim().toLowerCase()).values()].filter((group) => group.length > 1);
  if (duplicateFolders.length) {
    const withActive = duplicateFolders.filter((group) => group.filter((mod) => mod.status === 'active').length > 1);
    const flat = duplicateFolders.flat();
    findings.push(makeFinding({
      id: 'duplicate-folder',
      rule: 'duplicate-folder',
      family: 'duplicates',
      severity: withActive.length ? 'critical' : 'warning',
      title: `${formatNumber(flat.length)} entries across ${formatNumber(duplicateFolders.length)} folders share the same folder name`,
      summary: 'One folder name, several inventory entries',
      why: 'The scan produced more than one entry for a single folder on disk, so the same files are counted and loaded more than once.',
      impact: 'Loading the same folder twice duplicates params and effects, which is a classic cause of crashes and of a mod that "works once then stops".',
      fix: 'Rebuild the inventory from scratch and check why the folder is scanned twice.',
      count: flat.length,
      subjects: listSubjects(flat),
      groups: duplicateFolders.slice(0, 40).map((group) => ({
        label: group[0].folderName,
        meta: `${group.length} entries`,
        items: listSubjects(group)
      }))
    }));
  }

  const folderCollisions = [...groupCounts(modItems, (mod) => mod.folderName.trim().toLowerCase().replace(/[\s._-]+/g, '')).values()]
    .filter((group) => group.length > 1 && new Set(group.map((mod) => mod.folderName.trim().toLowerCase())).size > 1);
  if (folderCollisions.length) {
    const flat = folderCollisions.flat();
    findings.push(makeFinding({
      id: 'folder-collision',
      rule: 'folder-collision',
      family: 'duplicates',
      severity: 'warning',
      title: `${formatNumber(flat.length)} folders collide after normalising names`,
      summary: 'Names differ only by spaces, dots or case',
      why: 'On Windows two folder names that differ only by trailing spaces, dots or letter case can resolve to the same directory.',
      impact: 'One of the two entries can overwrite or hide the other depending on the file system call, which makes the result non reproducible.',
      fix: 'Rename one folder so the names differ by more than case or punctuation.',
      count: flat.length,
      subjects: listSubjects(flat),
      groups: folderCollisions.slice(0, 40).map((group) => ({
        label: group[0].folderName,
        meta: `${group.length} variants`,
        items: listSubjects(group)
      }))
    }));
  }

  const duplicateNames = [...groupCounts(modItems, (mod) => mod.name.trim().toLowerCase()).values()].filter((group) => group.length > 1);
  if (duplicateNames.length) {
    const flat = duplicateNames.flat();
    const activeShare = duplicateNames.filter((group) => group.filter((mod) => mod.status === 'active').length > 1);
    findings.push(makeFinding({
      id: 'duplicate-name',
      rule: 'duplicate-name',
      family: 'duplicates',
      severity: activeShare.length ? 'critical' : 'info',
      title: `${formatNumber(duplicateNames.length)} mod names appear in more than one folder`,
      summary: `Old and new copies of the same mod`,
      why: 'Two folders advertise the same mod name, usually after a manual reinstall next to an older version.',
      impact: activeShare.length
        ? 'Both copies are active, so the game loads whichever the scan reads last.'
        : 'The inventory shows the same mod twice, so "is it installed" has two answers.',
      fix: 'Delete the older folder and keep a single copy per mod.',
      count: flat.length,
      subjects: listSubjects(flat),
      groups: duplicateNames.slice(0, 40).map((group) => ({
        label: group[0].name,
        meta: `${group.length} folders`,
        items: listSubjects(group)
      }))
    }));
  }

  const noSource = modItems.filter((mod) => !mod.source.raw);
  const activeNoSource = noSource.filter((mod) => mod.status === 'active');
  if (noSource.length) {
    findings.push(makeFinding({
      id: 'no-source',
      rule: 'missing-source',
      family: 'sources',
      severity: 'info',
      title: `${formatNumber(noSource.length)} mods have no source URL`,
      summary: activeNoSource.length ? `${formatNumber(activeNoSource.length)} are active; a missing source URL does not prevent them from loading.` : 'These entries are disabled; a missing source URL does not affect mod loading.',
      why: 'No GameBanana reference was recorded when the mod was installed, so the app cannot show, update or credit it.',
      impact: 'The missing link can make it harder for a helper to identify the mod or find its download page. It does not indicate a loading problem.',
      count: noSource.length,
      subjects: listSubjects(noSource)
    }));
  }

  const oddHosts = modItems.filter((mod) => mod.source.raw && (!mod.source.host || !/^https?:/.test(mod.source.raw)));
  if (oddHosts.length) {
    findings.push(makeFinding({
      id: 'bad-source-url',
      rule: 'source-url-invalid',
      family: 'sources',
      severity: 'warning',
      title: `${formatNumber(oddHosts.length)} source URLs are not usable links`,
      summary: 'Missing scheme or host',
      why: 'The recorded string cannot be opened as a web address.',
      impact: 'The link in the UI leads nowhere.',
      fix: 'Re-import the mods so a real URL is recorded.',
      count: oddHosts.length,
      subjects: listSubjects(oddHosts),
      evidence: oddHosts.slice(0, 5).map((mod) => ({ label: mod.name, value: mod.source.raw, mono: true }))
    }));
  }

  const autoNamed = modItems.filter((mod) => mod.autoNamed);
  if (autoNamed.length) {
    findings.push(makeFinding({
      id: 'auto-named',
      rule: 'auto-named',
      family: 'metadata',
      severity: 'info',
      title: `${formatNumber(autoNamed.length)} mods have generated names`,
      summary: 'Name pattern mod-<timestamp>',
      why: 'A name like mod-1781997680300 appears to be a placeholder derived from the install time.',
      impact: 'This is a naming detail only; it does not indicate a loading or configuration problem.',
      count: autoNamed.length,
      subjects: listSubjects(autoNamed)
    }));
  }

  const missingVersion = modItems.filter((mod) => !mod.version);
  const missingAuthor = modItems.filter((mod) => !mod.authors);
  const missingCategory = modItems.filter((mod) => !mod.category);
  if (missingVersion.length || missingAuthor.length || missingCategory.length) {
    findings.push(makeFinding({
      id: 'metadata-gaps',
      rule: 'missing-metadata',
      family: 'metadata',
      severity: 'info',
      title: `Metadata is incomplete for most of the inventory`,
      summary: `${missingVersion.length} without version, ${missingAuthor.length} without author, ${missingCategory.length} without category`,
      why: 'Those fields come from the mod archive; when the archive is not the one the importer expects, they stay empty.',
      impact: 'Filtering and sorting by category or author is unreliable, and compatibility checks cannot use the version.',
      fix: 'Improve the metadata read at import time; until then treat empty fields as unknown rather than as "no category".',
      count: modItems.length,
      subjects: listSubjects(modItems.filter((mod) => !mod.version || !mod.authors || !mod.category)),
      groups: [
        { label: 'No version', meta: `${missingVersion.length} mods`, items: listSubjects(missingVersion) },
        { label: 'No author', meta: `${missingAuthor.length} mods`, items: listSubjects(missingAuthor) },
        { label: 'No category', meta: `${missingCategory.length} mods`, items: listSubjects(missingCategory) }
      ].filter((group) => group.items.length)
    }));
  }

  const namedMismatch = modItems.filter((mod) => !mod.nameMatchesFolder && mod.status === 'active');
  if (namedMismatch.length) {
    findings.push(makeFinding({
      id: 'name-mismatch',
      rule: 'name-folder-mismatch',
      family: 'metadata',
      severity: 'info',
      title: `${formatNumber(namedMismatch.length)} active mods display a name that differs from the folder`,
      summary: 'Display name and folder name diverge',
      why: 'The folder is the mod identifier on disk; the name is only what the UI shows.',
      impact: 'When a user reports "mod X is broken", the folder to look for is not the name in the report.',
      fix: 'Keep both values visible in the mod details, which this reader does.',
      count: namedMismatch.length,
      subjects: listSubjects(namedMismatch)
    }));
  }

  const config = model.configuration;
  const missingPaths = [];
  if (!config.modsPath) missingPaths.push('modsPath');
  if (!config.pluginsPath) missingPaths.push('pluginsPath');
  if (missingPaths.length) {
    findings.push(makeFinding({
      id: 'missing-paths',
      rule: 'missing-path',
      family: 'configuration',
      severity: 'warning',
      title: `${missingPaths.join(' and ')} are empty`,
      summary: 'The dump does not say where mods or plugins live',
      why: 'The path is what tells the app where to scan and where to write.',
      impact: 'Without it, nothing can be verified on disk and reinstalls land in the wrong place.',
      fix: 'Set the paths in the app settings and regenerate the dump.',
      count: missingPaths.length,
      evidence: missingPaths.map((name) => ({ label: 'field', value: name, mono: true }))
    }));
  }

  for (const [label, value] of [['modsPath', config.modsPath], ['pluginsPath', config.pluginsPath]]) {
    const traits = pathTraits(value);
    if (traits.length) {
      findings.push(makeFinding({
        id: `path-trait:${label}`,
        rule: 'path-suspicious',
        family: 'configuration',
        severity: 'warning',
        title: `${label} contains ${traits.join(' and ')}`,
        summary: 'The path is easy to misread for a file system call',
        why: 'Whitespace, repeated separators and non-ASCII characters are frequent causes of a file that exists but cannot be opened.',
        impact: 'Reads and writes can target two different locations that look identical in the UI.',
        fix: 'Move the library to a plain path such as D:\\mods and set it again.',
        count: traits.length,
        evidence: [
          { label: label, value, mono: true },
          { label: 'detected', value: traits.join(', ') }
        ]
      }));
    }
  }

  const expectedLibraryPaths = [
    { field: 'modsPath', label: 'Mods path', path: config.modsPath, pattern: /(?:^|\/)ultimate\/mods(?:\/|$)/i, expected: '\\ultimate\\mods' },
    { field: 'pluginsPath', label: 'Plugins path', path: config.pluginsPath, pattern: /(?:^|\/)01006a800016e000\/romfs\/skyline(?:\/|$)/i, expected: '\\01006A800016E000\\romfs\\skyline' }
  ];
  const invalidLibraryPaths = expectedLibraryPaths.filter(({ path, pattern }) => path && !pattern.test(path.replace(/\\/g, '/').replace(/\/+/g, '/')));
  if (invalidLibraryPaths.length) {
    findings.push(makeFinding({
      id: 'path-layout',
      rule: 'expected-path-layout',
      family: 'configuration',
      severity: 'warning',
      title: invalidLibraryPaths.length === 1 ? `${invalidLibraryPaths[0].label} does not match the expected folder` : 'Mods and plugins paths do not match the expected folders',
      summary: invalidLibraryPaths.map(({ label, expected }) => `${label} should include ${expected}`).join(' · '),
      why: 'A standard Super Smash Bros. Ultimate install keeps mods under ultimate\\mods and Skyline plugins under the game ID’s romfs\\skyline folder.',
      impact: 'If either path points at the wrong folder, the app or game may not find the intended mods or plugins, and the dump can show an incomplete inventory.',
      fix: 'Check the emulator’s mods and plugins folder settings. If the paths are intentionally custom, verify that the app and game scan those locations.',
      count: invalidLibraryPaths.length,
      evidence: invalidLibraryPaths.flatMap(({ field, label, path, expected }) => [
        { label, value: path, mono: true },
        { label: `${field} expected folder`, value: expected, mono: true }
      ])
    }));
  }

  if (!config.runMode) {
    findings.push(makeFinding({
      id: 'run-mode-missing',
      rule: 'missing-run-mode',
      family: 'configuration',
      severity: 'critical',
      title: 'The run mode is missing',
      summary: 'Emulator or console was never recorded',
      why: 'Every path and load decision depends on the mode the app was started in.',
      impact: 'A report without a mode cannot be reproduced.',
      fix: 'Regenerate the dump after the app has fully started.',
      count: 1
    }));
  } else if (/emulator/i.test(config.runMode) && !config.emulatorType) {
    findings.push(makeFinding({
      id: 'emulator-type',
      rule: 'missing-emulator-type',
      family: 'configuration',
      severity: 'warning',
      title: 'Emulator mode without an emulator name',
      summary: 'runMode says emulator, emulatorType is empty',
      why: 'The emulator decides where the mods folder is and how the game is launched.',
      impact: 'Path and behaviour differences between emulators cannot be attributed.',
      fix: 'Record the emulator type at start-up.',
      count: 1,
      evidence: [{ label: 'runMode', value: config.runMode, mono: true }]
    }));
  }

  const pluginsMissingRepo = pluginItems.filter((plugin) => !plugin.repository);
  if (pluginsMissingRepo.length) {
    findings.push(makeFinding({
      id: 'plugin-repo',
      rule: 'missing-plugin-repository',
      family: 'plugins',
      severity: 'info',
      title: `${formatNumber(pluginsMissingRepo.length)} plugins have no repository recorded`,
      summary: 'Version checks cannot run for them',
      why: 'Without a repository, the plugin cannot be matched against a build to see whether it is current.',
      impact: 'Outdated plugins are the most common source of "the mod loads but nothing happens".',
      fix: 'Add the repository to the plugin metadata or drop the field from the model.',
      count: pluginsMissingRepo.length,
      subjects: listSubjects(pluginsMissingRepo)
    }));
  }

  const pluginVersionFiles = pluginItems.filter((plugin) => plugin.versionLooksLikeFile);
  if (pluginVersionFiles.length) {
    findings.push(makeFinding({
      id: 'plugin-version',
      rule: 'plugin-version-not-version',
      family: 'plugins',
      severity: 'info',
      title: `${formatNumber(pluginVersionFiles.length)} plugin versions are file names`,
      summary: 'The archive name landed in the version field',
      why: 'A value such as one_slot_eff_13-0-4.zip is the downloaded file, not a version string.',
      impact: 'Any version comparison treats it as unknown, so update checks silently do nothing.',
      fix: 'Parse the version out of the file name or read it from the plugin itself.',
      count: pluginVersionFiles.length,
      subjects: listSubjects(pluginVersionFiles),
      evidence: pluginVersionFiles.map((plugin) => ({ label: plugin.name, value: plugin.version, mono: true }))
    }));
  }

  const expectedPlugins = CORE_PLUGINS.map((entry) => ({
    ...entry,
    present: pluginItems.some((plugin) => plugin.slug === entry.key || plugin.slug.startsWith(entry.key))
  }));
  const missingCore = expectedPlugins.filter((entry) => entry.need === 'required' && !entry.present);
  const missingRecommended = expectedPlugins.filter((entry) => entry.need === 'recommended' && !entry.present);
  if (missingCore.length) {
    findings.push(makeFinding({
      id: 'core-plugin-missing',
      rule: 'core-plugin-missing',
      family: 'plugins',
      severity: 'critical',
      title: `${missingCore.map((entry) => entry.label).join(', ')} not found`,
      summary: 'A plugin every mod install needs is absent',
      why: missingCore.map((entry) => `${entry.label}: ${entry.why}`).join('; '),
      impact: 'Mods may be listed and active while nothing is actually patched in game.',
      fix: 'Install the missing plugin into the Skyline plugins folder and restart the emulator.',
      count: missingCore.length,
      evidence: missingCore.map((entry) => ({ label: entry.label, value: entry.why }))
    }));
  }
  if (missingRecommended.length) {
    findings.push(makeFinding({
      id: 'recommended-plugin-missing',
      rule: 'recommended-plugin-missing',
      family: 'plugins',
      severity: 'info',
      title: `${missingRecommended.map((entry) => entry.label).join(', ')} not found`,
      summary: 'Plugins that movesets and params rely on',
      why: missingRecommended.map((entry) => `${entry.label}: ${entry.why}`).join('; '),
      impact: 'Moveset or param mods can be active and still do nothing.',
      fix: 'Install them if you use movesets or param edits.',
      count: missingRecommended.length
    }));
  }

  const duplicatePlugins = [...model.index.pluginNames.values()].filter((group) => group.length > 1).flat();
  if (duplicatePlugins.length) {
    findings.push(makeFinding({
      id: 'duplicate-plugin',
      rule: 'duplicate-plugin',
      family: 'plugins',
      severity: 'warning',
      title: `${formatNumber(duplicatePlugins.length)} plugin files appear more than once`,
      summary: 'The same plugin is loaded twice',
      why: 'Two files with the same plugin slug exist in the plugins folder.',
      impact: 'Two versions of one plugin hook the same game functions, which is a common cause of crashes at boot.',
      fix: 'Keep the newest file and delete the other.',
      count: duplicatePlugins.length,
      subjects: listSubjects(duplicatePlugins)
    }));
  }

  const activeNoPlugins = activePlugins.length === 0;
  if (!activeNoPlugins && pluginItems.length && activePlugins.length < pluginItems.length) {
    findings.push(makeFinding({
      id: 'plugin-inactive',
      rule: 'plugin-inactive',
      family: 'plugins',
      severity: 'info',
      title: `${formatNumber(pluginItems.length - activePlugins.length)} plugin files are not active`,
      summary: 'Present on disk but reported inactive',
      why: 'The scan found the file but marked it as not loaded.',
      impact: 'A plugin you expect to be running may be inert.',
      fix: 'Check that every file in the plugins folder is meant to be loaded.',
      count: pluginItems.length - activePlugins.length,
      subjects: listSubjects(pluginItems.filter((plugin) => plugin.status !== 'active'))
    }));
  }

  const system = model.system;
  const memory = system.memory;
  if (memory !== null && memory < 8 * 1024 ** 3) {
    findings.push(makeFinding({
      id: 'low-memory',
      rule: 'low-memory',
      family: 'system',
      severity: 'warning',
      title: `Only ${formatBytes(memory)} of RAM reported`,
      summary: 'Modded sessions need headroom',
      why: 'A large mod list plus an emulator can exhaust memory, and the first symptom is a crash that looks like a mod bug.',
      impact: 'Crashes reported as mod problems can be memory exhaustion.',
      fix: 'Close other applications, or reduce the number of active mods.',
      count: 1,
      evidence: [{ label: 'totalMemoryBytes', value: String(memory), mono: true }]
    }));
  }
  if (system.cpuCount !== null && system.cpuCount < 4) {
    findings.push(makeFinding({
      id: 'few-cpus',
      rule: 'few-cpus',
      family: 'system',
      severity: 'info',
      title: `${formatNumber(system.cpuCount)} CPU cores reported`,
      summary: 'Emulation is CPU bound',
      why: 'Fewer cores than the emulator can use leads to stutter that users often attribute to a mod.',
      impact: 'Performance reports are hard to compare with a machine that has more cores.',
      fix: 'No action needed, but note it in any report.',
      count: 1
    }));
  }
  if (system.platform && system.platform !== 'win32') {
    findings.push(makeFinding({
      id: 'platform',
      rule: 'non-windows-platform',
      family: 'system',
      severity: 'info',
      title: `Dump generated on ${system.platform}`,
      summary: 'Path conventions differ from Windows',
      why: 'The emulator folders and case sensitivity rules used here are those of another operating system.',
      impact: 'Folder names that look duplicated on Windows may be two distinct folders here, and the reverse is also true.',
      fix: 'Read folder collisions with the platform in mind.',
      count: 1,
      evidence: [
        { label: 'platform', value: system.platform, mono: true },
        { label: 'architecture', value: system.arch || 'unknown', mono: true }
      ]
    }));
  }
  if (model.app.version && /-(alpha|beta|rc|pre|dev)/i.test(model.app.version)) {
    findings.push(makeFinding({
      id: 'prerelease',
      rule: 'prerelease-build',
      family: 'system',
      severity: 'info',
      title: `Pre-release build ${model.app.version}`,
      summary: 'Behaviour can change between builds',
      why: 'A beta build may write dump fields differently from the stable one.',
      impact: 'A bug found here is worth confirming on the stable build before it is reported.',
      fix: 'Mention the exact build in any report.',
      count: 1,
      evidence: [{ label: 'version', value: model.app.version, mono: true }]
    }));
  }
  if (model.generatedAtMs !== null) {
    const age = now - model.generatedAtMs;
    if (age < -60 * 1000) {
      findings.push(makeFinding({
        id: 'clock-skew',
        rule: 'timestamp-in-future',
        family: 'system',
        severity: 'warning',
        title: 'The dump is dated in the future',
        summary: `generatedAt is ${formatRelative(model.generatedAtMs, now)}`,
        why: 'The generation timestamp comes from the machine clock, which appears to be ahead.',
        impact: 'Log lines and this dump cannot be lined up, which breaks any sequence analysis.',
        fix: 'Fix the system clock and regenerate.',
        count: 1,
        evidence: [{ label: 'generatedAt', value: model.generatedAt, mono: true }]
      }));
    } else if (age > 24 * 3600 * 1000) {
      findings.push(makeFinding({
        id: 'stale-dump',
        rule: 'stale-dump',
        family: 'system',
        severity: age > 7 * 86400 * 1000 ? 'warning' : 'info',
        title: `This dump is ${formatRelative(model.generatedAtMs, now)}`,
        summary: 'It may not describe the current install',
        why: 'A dump is a snapshot: mods added, enabled or removed since then are not in it.',
        impact: 'Conclusions drawn from a stale snapshot can be wrong about the current state.',
        fix: 'Regenerate the dump right before you investigate, or compare this one with a fresh dump.',
        count: 1,
        evidence: [
          { label: 'generatedAt', value: model.generatedAt, mono: true },
          { label: 'age', value: formatRelative(model.generatedAtMs, now) }
        ],
        links: [{ label: 'Open compare', view: 'compare' }]
      }));
    }
  }

  return findings;
}

export function summarizeSignals(findings) {
  const counts = { critical: 0, warning: 0, info: 0, ok: 0 };
  const instances = { critical: 0, warning: 0, info: 0, ok: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
    instances[finding.severity] += finding.count;
  }
  return { counts, instances, total: counts.critical + counts.warning + counts.info };
}

export function analyze(model, now = Date.now()) {
  const findings = buildFindings(model, now);
  findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.count - a.count || a.title.localeCompare(b.title));
  return { findings, signals: summarizeSignals(findings) };
}

export function familyCounts(findings) {
  const map = new Map();
  for (const finding of findings) map.set(finding.family, (map.get(finding.family) || 0) + 1);
  return map;
}
