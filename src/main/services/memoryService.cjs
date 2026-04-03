const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const schemaValidator = require('./schemaValidatorService.cjs');

const MEMORY_DIR = path.join(os.homedir(), '.ai-file-organizer', 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'preferences.json');

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function defaultMemory() {
  return {
    memoryId: 'default',
    preferences: {
      protectedDirectories: [],
      businessTypeOverrides: [],
      preferredSchemeByPath: [],
      separateInstallerPackages: true,
    },
  };
}

async function ensureStorage() {
  await fs.mkdir(MEMORY_DIR, { recursive: true });
}

async function getPreferenceMemory() {
  await ensureStorage();
  try {
    const raw = await fs.readFile(MEMORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const validation = schemaValidator.validatePreferenceMemory(parsed);
    if (validation.valid) return parsed;
  } catch {}

  const initial = defaultMemory();
  await savePreferenceMemory(initial);
  return initial;
}

async function savePreferenceMemory(memory) {
  await ensureStorage();
  schemaValidator.assertValid('preference-memory.schema.json', memory, 'PreferenceMemory validation failed');
  await fs.writeFile(MEMORY_FILE, JSON.stringify(memory, null, 2), 'utf8');
  return memory;
}

async function updatePreferenceMemory(patch = {}) {
  const current = await getPreferenceMemory();
  const merged = {
    memoryId: current.memoryId || 'default',
    preferences: {
      protectedDirectories:
        patch.protectedDirectories !== undefined
          ? normalizeArray(patch.protectedDirectories)
          : normalizeArray(current.preferences.protectedDirectories),
      businessTypeOverrides:
        patch.businessTypeOverrides !== undefined
          ? normalizeArray(patch.businessTypeOverrides)
          : normalizeArray(current.preferences.businessTypeOverrides),
      preferredSchemeByPath:
        patch.preferredSchemeByPath !== undefined
          ? normalizeArray(patch.preferredSchemeByPath)
          : normalizeArray(current.preferences.preferredSchemeByPath),
      separateInstallerPackages:
        patch.separateInstallerPackages !== undefined
          ? Boolean(patch.separateInstallerPackages)
          : current.preferences.separateInstallerPackages !== false,
    },
  };

  return savePreferenceMemory(merged);
}

function buildPreferenceHits(targetPath, memory) {
  const hits = [];
  const prefs = memory?.preferences || {};

  for (const protectedDir of normalizeArray(prefs.protectedDirectories)) {
    if (String(protectedDir) === String(targetPath)) {
      hits.push('protected-directory:exact-match');
    }
  }

  for (const pref of normalizeArray(prefs.preferredSchemeByPath)) {
    if (String(pref.path) === String(targetPath) && pref.schemeType) {
      hits.push(`preferred-scheme:${pref.schemeType}`);
    }
  }

  if (prefs.separateInstallerPackages === true) {
    hits.push('separate-installer-packages:true');
  }

  if (normalizeArray(prefs.businessTypeOverrides).length > 0) {
    hits.push('business-overrides:available');
  }

  return hits;
}

module.exports = {
  getPreferenceMemory,
  savePreferenceMemory,
  updatePreferenceMemory,
  buildPreferenceHits,
};

