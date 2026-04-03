const path = require('path');

function toSet(values) {
  return new Set(Array.isArray(values) ? values.filter(Boolean) : []);
}

function jaccard(setA, setB) {
  if (!setA.size && !setB.size) return 1;
  const union = new Set([...setA, ...setB]);
  if (!union.size) return 1;
  let intersect = 0;
  for (const item of setA) {
    if (setB.has(item)) intersect += 1;
  }
  return intersect / union.size;
}

function mapSimilarity(mapA, mapB) {
  const keys = new Set([...mapA.keys(), ...mapB.keys()]);
  if (!keys.size) return 1;

  let numerator = 0;
  let denominator = 0;
  for (const key of keys) {
    const a = mapA.get(key) || 0;
    const b = mapB.get(key) || 0;
    numerator += Math.min(a, b);
    denominator += Math.max(a, b);
  }
  if (denominator === 0) return 1;
  return numerator / denominator;
}

function normalizeReasonTags(reasons) {
  const tags = new Set();
  for (const reason of reasons || []) {
    const text = String(reason || '');
    if (!text) continue;
    if (text.includes('待确认') || text.includes('保守')) tags.add('conservative');
    if (text.includes('业务')) tags.add('business');
    if (text.includes('类别')) tags.add('category');
    if (text.includes('保护')) tags.add('protected');
    if (text.includes('偏好')) tags.add('preference');
    if (text.includes('不建议自动整理')) tags.add('hold_safe');
  }
  return tags;
}

function buildFolderPathMap(folders) {
  const byId = new Map();
  (folders || []).forEach((folder) => byId.set(folder.folderId, folder));

  const cache = new Map();
  function resolve(folderId) {
    if (cache.has(folderId)) return cache.get(folderId);
    const folder = byId.get(folderId);
    if (!folder) return '';
    const own = folder.pathName || folder.displayName || folder.folderId;
    if (!folder.parentFolderId) {
      cache.set(folderId, own);
      return own;
    }
    const parent = resolve(folder.parentFolderId);
    const full = parent ? `${parent}/${own}` : own;
    cache.set(folderId, full);
    return full;
  }

  for (const folder of folders || []) {
    resolve(folder.folderId);
  }
  return cache;
}

function schemeTypeRank(schemeType) {
  if (schemeType === 'business_category') return 1.0;
  if (schemeType === 'business') return 0.8;
  return 0.6;
}

function confidenceBoost(confidenceLevel) {
  if (confidenceLevel === 'very_high') return 0.1;
  if (confidenceLevel === 'high') return 0.07;
  if (confidenceLevel === 'medium') return 0.04;
  if (confidenceLevel === 'low') return 0.01;
  return 0;
}

function explainabilityScore(item) {
  const reasonRichness = Math.min(3, (item.scheme.reasons || []).length) / 3;
  const reasonTagScore = Math.min(1, item.reasonTags.size / 4);
  const schemeRank = schemeTypeRank(item.scheme.schemeType);
  const confidence = Number(item.scheme.confidence || 0);
  return reasonRichness * 0.3 + reasonTagScore * 0.2 + schemeRank * 0.25 + confidence * 0.25;
}

function buildUncertainExplanations({ profile, uncertainCount, uncertainRatio }) {
  const explanations = [];
  if (uncertainCount <= 0) return explanations;

  const topBusinessScore = profile?.businessSignals?.[0]?.score || 0;
  if (topBusinessScore < 0.2) {
    explanations.push('文件命名模糊，业务信号不足');
  }

  const mixedDirectoryTypes = new Set(['mixed', 'desktop_heap', 'download_heap', 'project_container']);
  if (mixedDirectoryTypes.has(profile?.summary?.directoryType)) {
    explanations.push('目录内容混杂，自动归类风险较高');
  }

  if ((profile?.protectedItems || []).length > 0) {
    explanations.push('检测到项目内容已保护，相关文件未参与自动移动');
  }

  if ((profile?.hiddenDirectoryCandidates || []).length > 0) {
    explanations.push('检测到历史隐藏目录，建议先修复后再整理');
  }

  if ((profile?.clusters || []).length > 20) {
    explanations.push('文件簇较分散，缺少稳定批次特征');
  }

  if ((uncertainCount >= 5 || uncertainRatio >= 0.3) && explanations.length === 0) {
    explanations.push('低置信度文件较多，建议先人工确认后再执行');
  }

  return explanations;
}

function buildDescriptor(scheme, profile) {
  const plannedMoves = (scheme.moves || []).filter((move) => move.statusHint === 'planned');
  const uncertainCount = (scheme.uncertainFiles || []).length;
  const totalMovable = plannedMoves.length + uncertainCount;
  const coverage = plannedMoves.length / Math.max(1, totalMovable);
  const uncertainRatio = uncertainCount / Math.max(1, totalMovable);

  const folderPathById = buildFolderPathMap(scheme.folders || []);
  const folderSummaryItems = (scheme.folders || [])
    .map((folder) => {
      const folderPath = folderPathById.get(folder.folderId) || folder.pathName || folder.displayName || folder.folderId;
      return `${folder.folderType}:${folderPath}`;
    })
    .sort();

  const targetSummary = new Map();
  for (const move of plannedMoves) {
    const rel = path.relative(profile.target.path, path.dirname(move.targetPath || ''));
    const key = rel || '.';
    targetSummary.set(key, (targetSummary.get(key) || 0) + 1);
  }

  const folderCountByTarget = new Map();
  for (const move of plannedMoves) {
    folderCountByTarget.set(move.targetFolderId, (folderCountByTarget.get(move.targetFolderId) || 0) + 1);
  }

  const usedFolderCount = folderCountByTarget.size;
  const avgFilesPerFolder = plannedMoves.length / Math.max(1, usedFolderCount);
  let tinyFolderCount = 0;
  for (const count of folderCountByTarget.values()) {
    if (count <= 2) tinyFolderCount += 1;
  }
  const tinyFolderRatio = usedFolderCount > 0 ? tinyFolderCount / usedFolderCount : 0;

  let displayState = 'actionable';
  if (plannedMoves.length === 0 && uncertainCount > 0) displayState = 'hold_safe';
  if (plannedMoves.length === 0 && uncertainCount === 0) displayState = 'empty_noop';

  const uncertainExplanations = buildUncertainExplanations({
    profile,
    uncertainCount,
    uncertainRatio,
  });

  return {
    scheme,
    plannedMovesCount: plannedMoves.length,
    uncertainCount,
    coverage,
    uncertainRatio,
    folderSummarySet: toSet(folderSummaryItems),
    targetSummaryMap: targetSummary,
    reasonTags: normalizeReasonTags(scheme.reasons || []),
    usedFolderCount,
    avgFilesPerFolder,
    tinyFolderCount,
    tinyFolderRatio,
    displayState,
    uncertainExplanations,
  };
}

function isDuplicateCandidate(a, b) {
  if (a.plannedMovesCount !== b.plannedMovesCount) return false;
  if (a.uncertainCount !== b.uncertainCount) return false;

  const folderSimilarity = jaccard(a.folderSummarySet, b.folderSummarySet);
  const targetSimilarity = mapSimilarity(a.targetSummaryMap, b.targetSummaryMap);
  const reasonSimilarity = jaccard(a.reasonTags, b.reasonTags);

  return folderSimilarity >= 0.85 && targetSimilarity >= 0.85 && reasonSimilarity >= 0.6;
}

function deduplicate(descriptors) {
  const groups = [];

  for (const descriptor of descriptors) {
    let matchedGroup = null;
    for (const group of groups) {
      if (isDuplicateCandidate(group.representative, descriptor)) {
        matchedGroup = group;
        break;
      }
    }
    if (!matchedGroup) {
      groups.push({
        representative: descriptor,
        members: [descriptor],
      });
      continue;
    }
    matchedGroup.members.push(descriptor);
    if (explainabilityScore(descriptor) > explainabilityScore(matchedGroup.representative)) {
      matchedGroup.representative = descriptor;
    }
  }

  const kept = [];
  for (const group of groups) {
    const selected = group.representative;
    selected.dedupGroupSize = group.members.length;
    kept.push(selected);
  }
  return kept;
}

function rankingScore(item) {
  if (item.displayState !== 'actionable') return -999;

  const schemeBonus = schemeTypeRank(item.scheme.schemeType);
  const valueScore = Math.log1p(item.plannedMovesCount) * 0.45 + item.coverage * 0.35 + schemeBonus * 0.2;

  const warningPenalty = Math.min(0.2, ((item.scheme.warnings || []).length || 0) * 0.05);
  const safetyPenalty = item.uncertainRatio * 0.5 + warningPenalty;

  // fragmentPenalty: 惩罚过碎结构
  const folderOverPenalty = Math.max(0, item.usedFolderCount - 8) * 0.03;
  const sparsePenalty = item.avgFilesPerFolder < 3 ? ((3 - item.avgFilesPerFolder) / 3) * 0.25 : 0;
  const tinyPenalty = item.tinyFolderRatio > 0.4 ? (item.tinyFolderRatio - 0.4) * 0.4 : 0;
  const fragmentPenalty = Math.min(0.45, folderOverPenalty + sparsePenalty + tinyPenalty);

  return valueScore + confidenceBoost(item.scheme.confidenceLevel) - safetyPenalty - fragmentPenalty;
}

function postProcessSchemes({ schemes, profile }) {
  const descriptors = (schemes || []).map((scheme) => buildDescriptor(scheme, profile));
  const deduped = deduplicate(descriptors);

  const actionable = deduped
    .filter((item) => item.displayState === 'actionable')
    .map((item) => ({
      ...item,
      rankScore: Number(rankingScore(item).toFixed(6)),
    }))
    .sort((a, b) => b.rankScore - a.rankScore || (b.scheme.confidence || 0) - (a.scheme.confidence || 0));

  const holdSafe = deduped
    .filter((item) => item.displayState === 'hold_safe')
    .sort((a, b) => (b.scheme.confidence || 0) - (a.scheme.confidence || 0));

  const visible = [...actionable, ...holdSafe];

  const recommended = actionable[0] || holdSafe[0] || null;
  const recommendedSchemeId = recommended?.scheme?.schemeId || null;

  const finalSchemes = visible.map((item) => ({
    ...item.scheme,
    displayState: item.displayState,
    isRecommended: item.scheme.schemeId === recommendedSchemeId,
    rankScore: item.displayState === 'actionable' ? item.rankScore : -1,
    uncertainExplanations: item.uncertainExplanations,
    dedupGroupSize: item.dedupGroupSize,
  }));

  return {
    schemes: finalSchemes,
    recommendedSchemeId,
  };
}

module.exports = {
  postProcessSchemes,
};

