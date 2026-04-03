const fs = require('fs').promises;
const path = require('path');

const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.csv', '.log', '.json', '.yml', '.yaml']);

function normalizeSnippet(text, maxChars = 1500) {
  if (!text) return '';
  return String(text)
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxChars);
}

function extractPrintableTokens(buffer, limit = 1600) {
  const source = buffer.toString('utf8');
  const tokens = source.match(/[\u4e00-\u9fa5A-Za-z0-9][\u4e00-\u9fa5A-Za-z0-9_\-]{1,24}/g) || [];
  return normalizeSnippet(tokens.slice(0, 240).join(' '), limit);
}

async function safeReadText(filePath, bytes = 24 * 1024) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.slice(0, bytesRead).toString('utf8');
  } catch {
    return '';
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
  }
}

async function safeReadBinaryPrefix(filePath, bytes = 64 * 1024) {
  let handle = null;
  try {
    handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.slice(0, bytesRead);
  } catch {
    return Buffer.alloc(0);
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
  }
}

async function extractLightContentSummary(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (TEXT_EXTENSIONS.has(extension)) {
    const text = await safeReadText(filePath, 28 * 1024);
    const summary = normalizeSnippet(text);
    return {
      used: summary.length > 0,
      summary,
    };
  }

  if (extension === '.pdf') {
    const buffer = await safeReadBinaryPrefix(filePath, 64 * 1024);
    const summary = extractPrintableTokens(buffer);
    return {
      used: summary.length > 0,
      summary,
    };
  }

  return { used: false, summary: '' };
}

module.exports = {
  extractLightContentSummary,
};
