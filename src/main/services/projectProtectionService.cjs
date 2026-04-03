const fs = require('fs').promises;
const path = require('path');

const REQUIRED_PROJECT_MARKERS = ['.git', 'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod'];
const REQUIRED_WORKSPACE_MARKERS = ['.vscode', '.idea'];

function detectMarkers(entryNames) {
  const hits = [];

  for (const marker of REQUIRED_PROJECT_MARKERS) {
    if (entryNames.includes(marker)) {
      hits.push(marker);
    }
  }

  for (const marker of REQUIRED_WORKSPACE_MARKERS) {
    if (entryNames.includes(marker)) {
      hits.push(marker);
    }
  }

  const workspaceFile = entryNames.find((name) => name.endsWith('.code-workspace'));
  if (workspaceFile) {
    hits.push(workspaceFile);
  }

  return hits;
}

function markerToProtectionType(marker) {
  if (marker === '.vscode' || marker === '.idea' || marker.endsWith('.code-workspace')) {
    return 'workspace';
  }
  return 'project_root';
}

function markerToReason(marker) {
  if (marker === '.git') return '检测到 .git，按项目根保护';
  if (marker === 'package.json') return '检测到 package.json，按项目根保护';
  if (marker === 'pyproject.toml') return '检测到 pyproject.toml，按项目根保护';
  if (marker === 'Cargo.toml') return '检测到 Cargo.toml，按项目根保护';
  if (marker === 'go.mod') return '检测到 go.mod，按项目根保护';
  if (marker === '.vscode' || marker === '.idea' || marker.endsWith('.code-workspace')) {
    return `检测到 ${marker}，按工作区保护`;
  }
  return `检测到 ${marker}，按保护目录处理`;
}

async function countFilesRecursive(rootPath) {
  let count = 0;
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;

    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) count += 1;
    }
  }

  return count;
}

async function detectProtectedItems(targetPath) {
  const protectedItems = [];
  const protectedPathSet = new Set();
  let protectedFileCount = 0;

  const stack = [targetPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    let entries;

    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const entryNames = entries.map((entry) => entry.name);
    const markerHits = detectMarkers(entryNames);

    if (markerHits.length > 0) {
      const primaryMarker = markerHits[0];
      const item = {
        path: currentPath,
        reason: markerToReason(primaryMarker),
        protectionType: markerToProtectionType(primaryMarker),
      };

      protectedItems.push(item);
      protectedPathSet.add(currentPath);
      protectedFileCount += await countFilesRecursive(currentPath);
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const fullPath = path.join(currentPath, entry.name);
      stack.push(fullPath);
    }
  }

  return {
    protectedItems,
    protectedPathSet,
    protectedFileCount,
  };
}

function isPathProtected(filePath, protectedPathSet) {
  const normalizedFile = path.resolve(filePath);
  for (const protectedPath of protectedPathSet) {
    const normalizedProtected = path.resolve(protectedPath);
    if (normalizedFile === normalizedProtected) return true;
    if (normalizedFile.startsWith(`${normalizedProtected}${path.sep}`)) return true;
  }
  return false;
}

module.exports = {
  detectProtectedItems,
  isPathProtected,
};
