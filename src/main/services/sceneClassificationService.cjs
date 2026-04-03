const fs = require('fs');
const path = require('path');
const { extractLightContentSummary } = require('./contentSummaryService.cjs');

function resolveSceneTaxonomyPath() {
  const candidates = [
    path.join(__dirname, '..', '..', 'shared', 'config', 'scene-taxonomy.json'),
    path.join(process.cwd(), 'src', 'shared', 'config', 'scene-taxonomy.json'),
    path.join(process.cwd(), 'dist', 'shared', 'config', 'scene-taxonomy.json'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error(`scene-taxonomy.json not found. Checked: ${candidates.join(', ')}`);
}

const SCENE_TAXONOMY = JSON.parse(fs.readFileSync(resolveSceneTaxonomyPath(), 'utf8'));
const SCENE_CATEGORIES = SCENE_TAXONOMY.categories.map((item) => item.name);
const SCENE_POLICY_BY_NAME = new Map(SCENE_TAXONOMY.categories.map((item) => [item.name, item]));
const SCENE_SOURCE_ENUM = ['filename', 'path_context', 'cluster', 'content_summary', 'preference'];

const HIGH_VALUE_SCENES = new Set(['简历', '合同', '发票', 'PRD', '会议纪要', '调研报告']);
const STRONG_PRIORITY_SCENES = new Set(['简历', '合同', '发票', 'PRD', '会议纪要']);
const PRD_STRONG_MARKERS = new Set((SCENE_POLICY_BY_NAME.get('PRD')?.strongKeywords || []).map((item) => String(item).toLowerCase()));

const STRONG_SCENE_FILENAME_ANCHORS = {
  '简历': [/简历/i, /\bresume\b/i, /(^|[^a-z])cv([^a-z]|$)/i, /求职/i, /应聘/i],
  '合同': [/合同/i, /协议/i, /\bcontract\b/i, /签约/i, /条款/i],
  '发票': [/发票/i, /\binvoice\b/i, /税票/i, /专票/i, /普票/i],
  'PRD': [/\bprd\b/i, /产品需求文档/i, /product requirement/i, /需求规格/i],
  '会议纪要': [/会议纪要/i, /会议记录/i, /meeting notes/i, /纪要/i],
};

const RESUME_ROLE_HINTS = [
  '产品经理',
  '运营',
  '设计师',
  '设计',
  '工程师',
  '开发',
  '前端',
  '后端',
  '测试',
  '财务',
  '会计',
  '销售',
  '市场',
  '项目经理',
  '数据分析',
  '人力',
  'hr',
];

const RESUME_NEGATIVE_MARKERS = [
  '能力模型',
  '岗位说明',
  '职位说明',
  '任职要求',
  'jd',
  'job description',
  '招聘需求',
  '胜任力',
  '说明书',
  '流程图',
  '规范',
  '标准',
];

const RESUME_DOC_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.md', '.pages']);

const SOURCE_WEIGHTS = {
  filename: 0.46,
  path_context: 0.2,
  cluster: 0.14,
  content_summary: 0.3,
  preference: 0.35,
};

const LIGHT_ANALYSIS_EXTENSIONS = new Set(['.txt', '.md', '.markdown', '.pdf', '.csv', '.log', '.json']);
const LIGHT_ANALYSIS_TIMEOUT_MS = 350;

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function roundScore(score) {
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LIGHT_ANALYSIS_TIMEOUT')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function matchKeywords(haystack, keywords) {
  if (!haystack || !Array.isArray(keywords) || keywords.length === 0) return [];
  const text = normalizeText(haystack);
  const matched = [];
  for (const keyword of keywords) {
    const k = normalizeText(keyword);
    if (!k) continue;
    if (text.includes(k)) matched.push(keyword);
  }
  return unique(matched);
}

function detectStrongSceneAnchors(sceneName, fileName) {
  const patterns = STRONG_SCENE_FILENAME_ANCHORS[sceneName] || [];
  if (patterns.length === 0) return [];
  const text = String(fileName || '');
  const matched = [];
  for (const regex of patterns) {
    if (regex.test(text)) matched.push(`strong_anchor:${sceneName}:${regex.source}`);
  }
  return unique(matched);
}

function detectResumeImplicitAnchors(file) {
  const fileName = String(file?.fileName || '');
  const extension = normalizeText(path.extname(fileName));
  if (!RESUME_DOC_EXTENSIONS.has(extension)) return [];

  const normalized = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[()（）【】\[\]{}]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return [];

  const lower = normalizeText(normalized);
  if (RESUME_NEGATIVE_MARKERS.some((marker) => lower.includes(normalizeText(marker)))) {
    return [];
  }

  const tokens = normalized
    .split(/[\s,，、]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const hasRoleToken = tokens.some((token) =>
    RESUME_ROLE_HINTS.some((hint) => normalizeText(token).includes(normalizeText(hint)))
  );
  if (!hasRoleToken) return [];

  const personNameToken = tokens.find((token) => {
    if (!/^[\u4e00-\u9fa5]{2,4}$/.test(token)) return false;
    return !RESUME_ROLE_HINTS.some((hint) => normalizeText(token).includes(normalizeText(hint)));
  });
  const copiedNameMatch = normalized.match(/[\s_-]([\u4e00-\u9fa5]{2,4})(?:的副本|副本|自动保存|复制|拷贝)/);
  const personName = personNameToken || copiedNameMatch?.[1] || null;
  if (!personName) return [];

  const scoreToken = /(?:\d+\s*年|应届|校招|社招|求职|面试)/i.test(normalized);
  const signals = [
    'implicit_anchor:简历:role_token',
    'implicit_anchor:简历:person_name_token',
  ];
  if (scoreToken) signals.push('implicit_anchor:简历:career_token');

  return signals;
}

function clusterLabelForFile(file, profile) {
  const clusters = profile?.clusters || [];
  for (const cluster of clusters) {
    if ((cluster.sampleFiles || []).includes(file.fileName)) {
      return cluster.label || '';
    }
  }
  return '';
}

function preferenceSignalsForFile(file, preferenceMemory) {
  const overrides = preferenceMemory?.preferences?.sceneCategoryOverrides;
  if (!Array.isArray(overrides) || overrides.length === 0) return [];

  const hits = [];
  for (const override of overrides) {
    if (!override?.filePattern || !override?.sceneCategory) continue;
    try {
      const regex = new RegExp(override.filePattern, 'i');
      if (regex.test(file.fileName) || regex.test(file.relativePath || '')) {
        hits.push(override.sceneCategory);
      }
    } catch {
      // ignore invalid pattern
    }
  }
  return unique(hits);
}

function evaluateCategorySignals({ policy, file, profile, contentSummary, preferenceMemory }) {
  const matchesBySource = {
    filename: matchKeywords(file.fileName, policy.keywords?.filename || []),
    path_context: matchKeywords(file.relativePath, policy.keywords?.path_context || []),
    cluster: matchKeywords(clusterLabelForFile(file, profile), policy.keywords?.path_context || []),
    content_summary: matchKeywords(contentSummary, policy.keywords?.content_summary || []),
    preference: [],
  };

  const preferenceHits = preferenceSignalsForFile(file, preferenceMemory);
  if (preferenceHits.includes(policy.name)) {
    matchesBySource.preference = ['preference_override'];
  }

  let score = 0;
  const sourceScores = {};
  for (const source of SCENE_SOURCE_ENUM) {
    const matched = matchesBySource[source] || [];
    if (matched.length === 0) continue;
    const boost = source === 'preference'
      ? 1
      : Math.min(1, 0.65 + (matched.length - 1) * 0.2);
    const sourceScore = SOURCE_WEIGHTS[source] * boost;
    sourceScores[source] = roundScore(sourceScore);
    score += sourceScore;
  }

  const extension = normalizeText(path.extname(file.fileName));
  if ((policy.typicalExtensions || []).map((item) => normalizeText(item)).includes(extension)) {
    score += 0.07;
  }

  const strongAnchorSignals = detectStrongSceneAnchors(policy.name, file.fileName);
  if (policy.name === '简历') {
    strongAnchorSignals.push(...detectResumeImplicitAnchors(file));
  }
  const implicitResumeAnchorHit =
    policy.name === '简历' && strongAnchorSignals.some((signal) => signal.startsWith('implicit_anchor:简历:'));
  if (implicitResumeAnchorHit) {
    const implicitBoost = 0.18;
    score += implicitBoost;
    sourceScores.filename = roundScore((sourceScores.filename || 0) + implicitBoost);
    matchesBySource.filename = unique([...(matchesBySource.filename || []), ...strongAnchorSignals]);
  }
  if (STRONG_PRIORITY_SCENES.has(policy.name) && strongAnchorSignals.length > 0) {
    const anchorBoost = Math.min(0.34, 0.22 + (strongAnchorSignals.length - 1) * 0.05);
    score += anchorBoost;
    sourceScores.filename = roundScore((sourceScores.filename || 0) + anchorBoost);
    matchesBySource.filename = unique([...(matchesBySource.filename || []), ...strongAnchorSignals]);
  }

  const allSignals = unique(
    SCENE_SOURCE_ENUM.flatMap((source) => matchesBySource[source] || [])
  );

  return {
    score: roundScore(score),
    signalCount: allSignals.length,
    matchesBySource,
    sourceScores,
    allSignals,
    strongAnchorHit: strongAnchorSignals.length > 0,
  };
}

function pickDominantSource(sourceScores) {
  let bestSource = null;
  let bestScore = -1;
  for (const source of SCENE_SOURCE_ENUM) {
    const score = sourceScores[source] || 0;
    if (score > bestScore) {
      bestScore = score;
      bestSource = source;
    }
  }
  return bestSource || 'filename';
}

function shouldRunLightAnalysis({ topQuickCandidate, topQuickScore, topPolicy, file }) {
  if (!topQuickCandidate) return false;
  const extension = normalizeText(path.extname(file.fileName));
  if (!LIGHT_ANALYSIS_EXTENSIONS.has(extension)) return false;

  const isHighValue = HIGH_VALUE_SCENES.has(topQuickCandidate);
  if (isHighValue && topQuickScore < (topPolicy.minScore + 0.18)) return true;

  if (topQuickCandidate === 'PRD' || topQuickCandidate === '需求文档') {
    return topQuickScore < (topPolicy.minScore + 0.22);
  }

  return false;
}

function pickBestCandidate(evaluations) {
  const sorted = evaluations
    .filter((item) => item.signalCount > 0)
    .sort((a, b) => b.score - a.score || b.signalCount - a.signalCount);

  if (sorted.length === 0) return null;

  const strongPriorityHit = sorted.find((candidate) => {
    if (!STRONG_PRIORITY_SCENES.has(candidate.category)) return false;
    if (!candidate.strongAnchorHit) return false;
    const minEvidence = candidate.policy.minEvidenceCount || 1;
    const minScore = candidate.policy.minScore || 0;
    return candidate.signalCount >= minEvidence && candidate.score >= minScore;
  });
  if (strongPriorityHit) return strongPriorityHit;

  const prd = sorted.find((item) => item.category === 'PRD');
  const demand = sorted.find((item) => item.category === '需求文档');

  if (prd && demand) {
    const prdStrong = (prd.matchesBySource.filename || []).concat(prd.matchesBySource.content_summary || [])
      .some((keyword) => PRD_STRONG_MARKERS.has(normalizeText(keyword)));

    if (prdStrong && prd.score >= (prd.policy.minScore || 0)) {
      return prd;
    }

    if (demand.score >= (demand.policy.minScore || 0) && demand.signalCount >= (demand.policy.minEvidenceCount || 0)) {
      return demand;
    }
  }

  for (const candidate of sorted) {
    const minEvidence = candidate.policy.minEvidenceCount || 1;
    const minScore = candidate.policy.minScore || 0;
    if (candidate.signalCount >= minEvidence && candidate.score >= minScore) {
      return candidate;
    }
  }

  return null;
}

async function classifyFileScene({ file, profile, preferenceMemory, allowLightContent = true }) {
  const quickEvaluations = [];
  for (const policy of SCENE_TAXONOMY.categories) {
    const evaluation = evaluateCategorySignals({
      policy,
      file,
      profile,
      contentSummary: '',
      preferenceMemory,
    });
    quickEvaluations.push({
      category: policy.name,
      policy,
      ...evaluation,
    });
  }

  const topQuick = quickEvaluations
    .slice()
    .sort((a, b) => b.score - a.score || b.signalCount - a.signalCount)[0] || null;

  let contentSummary = '';
  let analysisUsed = false;

  if (allowLightContent && topQuick) {
    const shouldAnalyze = shouldRunLightAnalysis({
      topQuickCandidate: topQuick.category,
      topQuickScore: topQuick.score,
      topPolicy: topQuick.policy,
      file,
    });

    if (shouldAnalyze) {
      const summaryResult = await withTimeout(
        extractLightContentSummary(file.sourcePath),
        LIGHT_ANALYSIS_TIMEOUT_MS,
      ).catch(() => ({ used: false, summary: '' }));
      if (summaryResult.used) {
        contentSummary = summaryResult.summary;
        analysisUsed = true;
      }
    }
  }

  const finalEvaluations = [];
  for (const policy of SCENE_TAXONOMY.categories) {
    const evaluation = evaluateCategorySignals({
      policy,
      file,
      profile,
      contentSummary,
      preferenceMemory,
    });
    finalEvaluations.push({
      category: policy.name,
      policy,
      ...evaluation,
    });
  }

  const best = pickBestCandidate(finalEvaluations);
  if (!best) {
    return {
      sceneCategory: null,
    };
  }

  const dominantSource = pickDominantSource(best.sourceScores);
  const dominantSignals = (best.matchesBySource[dominantSource] || []).slice(0, 8);
  const allSignals = best.allSignals.slice(0, 12);

  return {
    sceneCategory: best.category,
    sceneKind: best.policy.sceneKind || 'semantic',
    sceneTier: best.policy.tier,
    sceneConfidence: roundScore(best.score),
    sceneEvidence: {
      source: dominantSource,
      signals: dominantSignals.length > 0 ? dominantSignals : allSignals,
      signalCount: best.signalCount,
      primaryReason: `${dominantSource} 命中 ${best.category} 证据`,
    },
    sceneAnalysisUsed: analysisUsed,
  };
}

async function classifyFiles({ files, profile, preferenceMemory, allowLightContent = true }) {
  const allFiles = Array.isArray(files) ? files : [];
  const out = new Map();
  if (allFiles.length === 0) return out;

  const workerCount = Math.min(8, Math.max(1, Math.ceil(allFiles.length / 40)));
  const lightAnalysisBudget = allowLightContent
    ? Math.min(120, Math.max(16, Math.floor(allFiles.length * 0.35)))
    : 0;

  let cursor = 0;
  let lightAnalysisUsed = 0;

  const worker = async () => {
    while (true) {
      const index = cursor;
      if (index >= allFiles.length) break;
      cursor += 1;

      const file = allFiles[index];
      const extension = normalizeText(path.extname(file?.fileName || ''));
      const canUseLightAnalysisByType = LIGHT_ANALYSIS_EXTENSIONS.has(extension);

      let useLightAnalysis = false;
      if (allowLightContent && canUseLightAnalysisByType && lightAnalysisUsed < lightAnalysisBudget) {
        lightAnalysisUsed += 1;
        useLightAnalysis = true;
      }

      const decision = await classifyFileScene({
        file,
        profile,
        preferenceMemory,
        allowLightContent: useLightAnalysis,
      });
      out.set(file.fileId, decision);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return out;
}

function summarizeSceneSignals({ files, profile }) {
  const counts = new Map();

  for (const file of files || []) {
    const quickResults = [];
    for (const policy of SCENE_TAXONOMY.categories) {
      const evaluation = evaluateCategorySignals({
        policy,
        file,
        profile,
        contentSummary: '',
        preferenceMemory: null,
      });
      quickResults.push({
        category: policy.name,
        policy,
        ...evaluation,
      });
    }

    const best = pickBestCandidate(quickResults);
    if (!best) continue;
    counts.set(best.category, (counts.get(best.category) || 0) + 1);
  }

  const sceneDistribution = SCENE_CATEGORIES
    .filter((category) => counts.has(category))
    .map((category) => ({ category, count: counts.get(category) }));

  const sceneSignals = sceneDistribution
    .map((item) => ({
      category: item.category,
      score: roundScore(item.count / Math.max(1, files.length)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    sceneDistribution,
    sceneSignals,
  };
}

module.exports = {
  SCENE_TAXONOMY,
  SCENE_CATEGORIES,
  SCENE_POLICY_BY_NAME,
  SCENE_SOURCE_ENUM,
  classifyFiles,
  summarizeSceneSignals,
};
