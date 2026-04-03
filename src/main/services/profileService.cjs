const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const projectProtectionService = require('./projectProtectionService.cjs');
const sceneClassificationService = require('./sceneClassificationService.cjs');
const schemaValidator = require('./schemaValidatorService.cjs');

const BUSINESS_KEYWORDS = {
  '运营': ['运营', '数据', '报表', '日报', '周报', '月报', '投放', '转化', 'roi', 'dau', '留存', '增长', '流量', '营销'],
  '产品': ['产品', '需求', 'prd', '原型', '方案', '功能', '用户', '体验', '交互', '流程', 'roadmap'],
  '客户': ['客户', '合同', '协议', '报价', '订单', '商务', '销售', '合作', '甲方', '供应商'],
  '调研': ['调研', '报告', '竞品', '市场', '研究', '访谈', '问卷', '趋势', '洞察'],
  '财务': ['财务', '发票', '报销', '预算', '对账', '付款', '收款', '税务', '成本', '费用'],
  '学习': ['学习', '笔记', '教程', '课程', '培训', '资料', '知识', '技能', '读书'],
  '项目': ['项目', '计划', '进度', '里程碑', '交付', '验收', '启动', '结项', '管理', 'pm'],
  '设计': ['设计', '素材', '图片', 'ui', '视觉', '品牌', 'logo', '海报', 'banner', '配色', '字体'],
};

const CATEGORY_BY_EXTENSION = {
  table: ['.xlsx', '.xls', '.csv', '.numbers'],
  document: ['.docx', '.doc', '.txt', '.md', '.pdf', '.pages'],
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.bmp', '.tiff'],
  presentation: ['.ppt', '.pptx', '.key'],
  mindmap: ['.xmind', '.mindnode', '.mindmeister'],
  archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
  installer: ['.dmg', '.pkg', '.apk', '.ipa', '.exe', '.msi'],
  audio: ['.mp3', '.wav', '.aac', '.flac'],
  video: ['.mp4', '.mov', '.avi', '.mkv'],
  code: ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.json', '.yml', '.yaml', '.toml'],
};

const HIDDEN_DIR_MAPPING = {
  '.xlsx': '表格',
  '.docx': '文档',
  '.xmind': '脑图',
  '.pdf': '文档',
  '.png': '图片',
  '.jpg': '图片',
  '.jpeg': '图片',
  '.zip': '压缩包',
  '.dmg': '安装包',
};

function hash(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function getFileCategory(extension) {
  const ext = extension.toLowerCase();
  for (const [category, exts] of Object.entries(CATEGORY_BY_EXTENSION)) {
    if (exts.includes(ext)) return category;
  }
  return 'other';
}

function getBusinessScores(fileName) {
  const lower = fileName.toLowerCase();
  const scores = [];

  for (const [category, keywords] of Object.entries(BUSINESS_KEYWORDS)) {
    const matched = keywords.filter((kw) => lower.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      const score = Math.min(1, matched.length / 4);
      scores.push({ category, score, matchedKeywords: matched.slice(0, 8) });
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}

function buildClusters(files) {
  const clusterMap = new Map();

  for (const file of files) {
    const stem = file.fileName.replace(/\.[^.]+$/, '');
    const token = stem.split(/[\s._-]+/).filter(Boolean)[0] || stem;
    const key = token.toLowerCase().slice(0, 24);
    if (!key || key.length < 2) continue;
    if (!clusterMap.has(key)) {
      clusterMap.set(key, []);
    }
    clusterMap.get(key).push(file.fileName);
  }

  const clusters = [];
  for (const [key, fileNames] of clusterMap.entries()) {
    if (fileNames.length < 2) continue;
    clusters.push({
      clusterId: hash(`cluster:${key}`),
      label: key,
      fileCount: fileNames.length,
      sampleFiles: fileNames.slice(0, 8),
    });
  }

  return clusters.sort((a, b) => b.fileCount - a.fileCount).slice(0, 30);
}

function computeComplexity(totalFiles) {
  if (totalFiles >= 4000) return 'very_high';
  if (totalFiles >= 1200) return 'high';
  if (totalFiles >= 200) return 'medium';
  return 'low';
}

function chooseStrategyHint({ sourceType, topBusinessScore, protectedCount, movableCount, totalFiles }) {
  if (protectedCount > 0 && movableCount === 0) return 'protect_only';
  if (sourceType === 'downloads') return 'category';
  if (sourceType === 'desktop' && totalFiles > 80) return 'category';
  if (topBusinessScore >= 0.75) return 'business';
  if (topBusinessScore >= 0.4) return 'business_category';
  if (topBusinessScore < 0.15 && totalFiles > 300) return 'manual_first';
  return 'category';
}

async function detectHiddenDirectoryCandidates(targetPath) {
  const candidates = [];
  let entries = [];

  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true });
  } catch {
    return candidates;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('.') || entry.name.length <= 1) continue;
    if (entry.name === '.DS_Store' || entry.name === '.localized') continue;
    const suggestedVisibleName = HIDDEN_DIR_MAPPING[entry.name.toLowerCase()] || null;

    candidates.push({
      name: entry.name,
      path: path.join(targetPath, entry.name),
      ...(suggestedVisibleName ? { suggestedVisibleName } : {}),
    });
  }

  return candidates;
}

async function scanFiles(targetPath, protectedPathSet) {
  const files = [];
  let totalFiles = 0;
  let topLevelFiles = 0;
  let subDirectories = 0;

  const stack = [{ dir: targetPath, isRoot: true }];

  while (stack.length > 0) {
    const { dir, isRoot } = stack.pop();
    let entries = [];

    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue;
        if (isRoot) subDirectories += 1;
        stack.push({ dir: fullPath, isRoot: false });
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name.startsWith('.')) continue;

      totalFiles += 1;
      if (isRoot) topLevelFiles += 1;

      if (projectProtectionService.isPathProtected(fullPath, protectedPathSet)) {
        continue;
      }

      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      const fileId = hash(`${fullPath}|${stats.size}|${stats.mtimeMs}`);
      files.push({
        fileId,
        fileName: entry.name,
        sourcePath: fullPath,
        relativePath: path.relative(targetPath, fullPath),
        extension,
        category: getFileCategory(extension),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    }
  }

  return { files, totalFiles, topLevelFiles, subDirectories };
}

function aggregateTypeDistribution(files) {
  const counts = new Map();
  for (const file of files) {
    counts.set(file.category, (counts.get(file.category) || 0) + 1);
  }

  const orderedCategories = ['table', 'document', 'image', 'presentation', 'mindmap', 'archive', 'installer', 'audio', 'video', 'code', 'other'];
  return orderedCategories
    .filter((category) => counts.has(category))
    .map((category) => ({ category, count: counts.get(category) }));
}

function aggregateBusinessSignals(files) {
  const scoreMap = new Map();
  const keywordMap = new Map();

  for (const file of files) {
    const scores = getBusinessScores(file.fileName);
    for (const scoreItem of scores) {
      const current = scoreMap.get(scoreItem.category) || 0;
      scoreMap.set(scoreItem.category, current + scoreItem.score);
      if (!keywordMap.has(scoreItem.category)) keywordMap.set(scoreItem.category, new Set());
      for (const kw of scoreItem.matchedKeywords || []) {
        keywordMap.get(scoreItem.category).add(kw);
      }
    }
  }

  const total = files.length || 1;
  return Array.from(scoreMap.entries())
    .map(([category, sum]) => ({
      category,
      score: Math.max(0, Math.min(1, sum / total)),
      matchedKeywords: Array.from(keywordMap.get(category) || []).slice(0, 8),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function inferDirectoryType({ sourceType, targetPath, protectedItems, totalFiles, subDirectories }) {
  if (sourceType === 'desktop') return 'desktop_heap';
  if (sourceType === 'downloads') return 'download_heap';

  const normalizedTarget = path.resolve(targetPath);
  const rootProtected = protectedItems.some((item) => path.resolve(item.path) === normalizedTarget);

  if (rootProtected) return 'project_root';
  if (protectedItems.length > 0) return 'project_container';
  if (subDirectories > 20 && totalFiles > 200) return 'mixed';
  return 'normal_heap';
}

async function buildDirectoryProfile({ targetPath, sourceType = 'user_selected', watched = false, preferenceHits = [] }) {
  const now = new Date().toISOString();
  const { protectedItems, protectedPathSet } = await projectProtectionService.detectProtectedItems(targetPath);
  const scanResult = await scanFiles(targetPath, protectedPathSet);
  const hiddenDirectoryCandidates = await detectHiddenDirectoryCandidates(targetPath);
  const clusters = buildClusters(scanResult.files);

  const typeDistribution = aggregateTypeDistribution(scanResult.files);
  const businessSignals = aggregateBusinessSignals(scanResult.files);
  const sceneInsights = sceneClassificationService.summarizeSceneSignals({
    files: scanResult.files,
    profile: {
      clusters,
    },
  });
  const topBusinessScore = businessSignals[0]?.score || 0;

  const target = {
    targetId: hash(`target:${targetPath}`),
    path: targetPath,
    displayName: path.basename(targetPath) || targetPath,
    sourceType,
    isAuthorized: true,
    isWatched: Boolean(watched),
    lastScannedAt: now,
  };

  const summary = {
    directoryType: inferDirectoryType({
      sourceType,
      targetPath,
      protectedItems,
      totalFiles: scanResult.totalFiles,
      subDirectories: scanResult.subDirectories,
    }),
    estimatedComplexity: computeComplexity(scanResult.totalFiles),
    recommendedStrategyHint: chooseStrategyHint({
      sourceType,
      topBusinessScore,
      protectedCount: protectedItems.length,
      movableCount: scanResult.files.length,
      totalFiles: scanResult.totalFiles,
    }),
    note: protectedItems.length > 0 ? `检测到 ${protectedItems.length} 个保护目录，内部文件默认不拆分` : '未检测到项目保护目录',
  };

  const profile = {
    profileId: hash(`profile:${targetPath}:${now}`),
    target,
    summary,
    scanStats: {
      totalFiles: scanResult.totalFiles,
      topLevelFiles: scanResult.topLevelFiles,
      subDirectories: scanResult.subDirectories,
      estimatedMovableFiles: scanResult.files.length,
      largeTaskModeSuggested: scanResult.totalFiles > 1000,
    },
    typeDistribution,
    businessSignals,
    clusters,
    sceneDistribution: sceneInsights.sceneDistribution,
    sceneSignals: sceneInsights.sceneSignals,
    protectedItems,
    hiddenDirectoryCandidates,
    preferenceHits,
  };

  schemaValidator.assertValid('directory-target.schema.json', target, 'DirectoryTarget validation failed');
  schemaValidator.assertValid('directory-profile.schema.json', profile, 'DirectoryProfile validation failed');

  return {
    profile,
    files: scanResult.files,
  };
}

module.exports = {
  buildDirectoryProfile,
  getFileCategory,
};
