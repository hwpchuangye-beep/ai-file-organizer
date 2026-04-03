const path = require('path');
const crypto = require('crypto');
const schemaValidator = require('./schemaValidatorService.cjs');
const schemePostProcessService = require('./schemePostProcessService.cjs');
const sceneClassificationService = require('./sceneClassificationService.cjs');
const objectIdentificationService = require('./objectIdentificationService.cjs');
const semanticAttributionService = require('./semanticAttributionService.cjs');

const BUSINESS_WHITELIST = ['运营', '产品', '客户', '调研', '财务', '学习', '项目', '设计'];

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

const CATEGORY_LABELS = {
  table: '表格',
  document: '文档',
  image: '图片',
  presentation: '演示',
  mindmap: '脑图',
  archive: '压缩包',
  installer: '安装包',
  audio: '音频',
  video: '视频',
  code: '代码',
  other: '其他',
};

function attachSceneFields(sceneDecision) {
  if (!sceneDecision || !sceneDecision.sceneCategory) {
    return { sceneCategory: null };
  }
  return {
    sceneCategory: sceneDecision.sceneCategory,
    sceneKind: sceneDecision.sceneKind || 'semantic',
    sceneConfidence: sceneDecision.sceneConfidence,
    sceneEvidence: sceneDecision.sceneEvidence,
    sceneAnalysisUsed: Boolean(sceneDecision.sceneAnalysisUsed),
  };
}

function attachUncertainFileSceneFields(base, sceneDecision) {
  return {
    ...base,
    ...attachSceneFields(sceneDecision),
  };
}

function resolveDecisionTraceMode(options = {}) {
  if (options.decisionTraceMode === 'acceptance') return 'acceptance';
  if (options.decisionTraceMode === 'debug') return 'debug';
  if (options.debugDecisionTrace === true) return 'debug';
  if (process.env.FILE_ORG_ACCEPTANCE_MODE === '1') return 'acceptance';
  if (process.env.FILE_ORG_DEBUG_DECISION_TRACE === '1') return 'debug';
  return null;
}

function inferNamingSourceFromFolderType(folderType) {
  if (folderType === 'scenario') return 'scenario';
  if (folderType === 'business' || folderType === 'business_category_parent') return 'business';
  if (folderType === 'category' || folderType === 'business_category_child') return 'category';
  if (folderType === 'uncertain') return 'fallback';
  return 'fallback';
}

function buildDecisionTrace({ mode, files, scheme, objectDecisions, semanticDecisions, foldersById }) {
  const moveByFileId = new Map();
  for (const move of scheme.moves || []) {
    if (move?.fileId) moveByFileId.set(move.fileId, move);
  }

  const uncertainSourceSet = new Set((scheme.uncertainFiles || []).map((item) => item.sourcePath));

  const entries = [];
  for (const file of files) {
    const objectDecision = objectDecisions?.get(file.fileId) || null;
    const semanticDecision = semanticDecisions?.get(file.fileId) || null;
    const matchedMove = moveByFileId.get(file.fileId) || null;
    const targetFolder = matchedMove ? foldersById.get(matchedMove.targetFolderId) : null;

    let executionAction = semanticDecision?.executionAction || 'keep';
    if (matchedMove?.statusHint === 'planned') executionAction = 'move';
    if (matchedMove?.statusHint === 'uncertain' || uncertainSourceSet.has(file.sourcePath)) executionAction = 'keep';
    if (semanticDecision?.semanticLayer === 'protected') executionAction = 'protect';

    let namingSource = semanticDecision?.namingSource || 'fallback';
    if (targetFolder?.folderType) {
      namingSource = inferNamingSourceFromFolderType(targetFolder.folderType);
    }
    if (semanticDecision?.semanticLayer === 'protected') namingSource = 'protected';

    entries.push({
      fileId: file.fileId,
      fileName: file.fileName,
      sourcePath: file.sourcePath,
      objectType: objectDecision?.objectType || 'uncertain_object',
      semanticLayer: semanticDecision?.semanticLayer || 'uncertain',
      namingSource,
      executionAction,
      downgradeReason: semanticDecision?.downgradeReason || objectDecision?.downgradeReason || null,
      targetFolderId: matchedMove?.targetFolderId || null,
      targetPath: matchedMove?.targetPath || null,
    });
  }

  return {
    mode,
    entries,
  };
}

function assertDecisionTraceCompleteness({ schemes, files, mode }) {
  if (!mode) return;
  const requiredFields = ['objectType', 'semanticLayer', 'namingSource', 'executionAction'];

  for (const scheme of schemes || []) {
    if (!scheme.decisionTrace || scheme.decisionTrace.mode !== mode) {
      throw new Error(`Decision trace missing in ${mode} mode for scheme ${scheme.schemeId}`);
    }
    const entries = scheme.decisionTrace.entries || [];
    if (entries.length !== files.length) {
      throw new Error(`Decision trace entries incomplete for scheme ${scheme.schemeId}: ${entries.length}/${files.length}`);
    }
    for (const entry of entries) {
      for (const field of requiredFields) {
        if (!entry[field]) {
          throw new Error(`Decision trace field ${field} missing for file ${entry.fileId} in scheme ${scheme.schemeId}`);
        }
      }
    }
  }
}

function hash(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function sanitizePathName(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('.')) return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  return trimmed;
}

function getFileBusinessScore(fileName) {
  const lower = fileName.toLowerCase();
  let bestCategory = null;
  let bestScore = 0;

  for (const category of BUSINESS_WHITELIST) {
    const keywords = BUSINESS_KEYWORDS[category] || [];
    const matchCount = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
    if (matchCount <= 0) continue;
    const score = Math.min(1, matchCount / 4);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return { category: bestCategory, score: bestScore };
}

function resolveConfidence(profile) {
  const signal = profile.businessSignals?.[0];
  const confidence = signal?.score || 0;

  if (confidence >= 0.8) return { confidence, confidenceLevel: 'very_high', schemeType: 'business' };
  if (confidence >= 0.6) return { confidence, confidenceLevel: 'high', schemeType: 'business' };
  if (confidence >= 0.35) return { confidence, confidenceLevel: 'medium', schemeType: 'business_category' };
  if (confidence >= 0.15) return { confidence, confidenceLevel: 'low', schemeType: 'category' };
  return { confidence, confidenceLevel: 'very_low', schemeType: 'category' };
}

function buildFolder(folderSeed) {
  const idKey = [
    folderSeed.folderType || 'other',
    folderSeed.parentFolderId || 'root',
    folderSeed.pathName || '',
    folderSeed.displayName || '',
  ].join('|');

  return {
    folderId: hash(`folder:${idKey}`),
    ...folderSeed,
  };
}

function folderPathMap(targetRoot, folders) {
  const byId = new Map();
  folders.forEach((folder) => byId.set(folder.folderId, folder));

  const cache = new Map();

  function resolve(folderId) {
    if (cache.has(folderId)) return cache.get(folderId);
    const folder = byId.get(folderId);
    if (!folder) return null;
    const safeName = sanitizePathName(folder.pathName);
    if (!safeName) return null;

    if (!folder.parentFolderId) {
      const abs = path.join(targetRoot, safeName);
      cache.set(folderId, abs);
      return abs;
    }

    const parentAbs = resolve(folder.parentFolderId);
    if (!parentAbs) return null;
    const abs = path.join(parentAbs, safeName);
    cache.set(folderId, abs);
    return abs;
  }

  const out = new Map();
  for (const folder of folders) {
    const abs = resolve(folder.folderId);
    if (abs) out.set(folder.folderId, abs);
  }
  return out;
}

function buildCategoryScheme({
  targetRoot,
  files,
  protectedItems,
  confidence,
  confidenceLevel,
  sceneDecisions,
  semanticDecisions,
}) {
  const veryLow = confidenceLevel === 'very_low';
  if (veryLow) {
    return {
      schemeType: 'category',
      confidence,
      confidenceLevel,
      primaryBusinessCategory: null,
      reasons: ['业务置信度极低，文件保持原位并标记为待确认'],
      folders: [],
      moves: [],
      uncertainFiles: files.map((file) =>
        attachUncertainFileSceneFields(
          {
            fileName: file.fileName,
            sourcePath: file.sourcePath,
            reason: '业务与类别信号过低，待确认且未自动移动',
          },
          sceneDecisions?.get(file.fileId)
        )
      ),
      protectedItems,
      warnings: ['极低置信度：待确认文件未自动移动'],
    };
  }

  const folderByCategory = new Map();
  const folderByScene = new Map();
  const folders = [];

  for (const [category, displayName] of Object.entries(CATEGORY_LABELS)) {
    const safeName = sanitizePathName(displayName);
    if (!safeName) continue;
    const folder = buildFolder({
      displayName,
      pathName: safeName,
      folderType: 'category',
      expectedFileCount: 0,
      parentFolderId: null,
    });
    folderByCategory.set(category, folder);
    folders.push(folder);
  }

  const sceneNames = new Set();
  for (const file of files) {
    const decision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    if (semanticDecision?.semanticLayer === 'scenario' && decision?.sceneCategory) {
      sceneNames.add(decision.sceneCategory);
    }
  }

  for (const sceneName of sceneNames) {
    const safeName = sanitizePathName(sceneName);
    if (!safeName) continue;
    const sceneFolder = buildFolder({
      displayName: sceneName,
      pathName: safeName,
      folderType: 'scenario',
      expectedFileCount: 0,
      parentFolderId: null,
    });
    folderByScene.set(sceneName, sceneFolder);
    folders.push(sceneFolder);
  }

  const folderPathById = folderPathMap(targetRoot, folders);
  const moves = [];
  const uncertainFiles = [];

  for (const file of files) {
    const sceneDecision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    let folder = null;
    let reason = '';

    if (
      semanticDecision?.semanticLayer === 'scenario' &&
      sceneDecision?.sceneCategory &&
      folderByScene.has(sceneDecision.sceneCategory)
    ) {
      folder = folderByScene.get(sceneDecision.sceneCategory);
      reason = `场景命中 ${sceneDecision.sceneCategory}`;
    } else {
      const category = CATEGORY_LABELS[file.category] ? file.category : 'other';
      folder = folderByCategory.get(category);
      if (semanticDecision?.semanticLayer === 'uncertain') {
        reason = '语义归属不稳定，降级到类别整理';
      } else if (semanticDecision?.semanticLayer === 'business') {
        reason = `业务信号不足以单独建业务目录，降级按类别整理到${folder.displayName}`;
      } else {
        reason = `按类别整理到${folder.displayName}`;
      }
    }

    const folderAbs = folderPathById.get(folder.folderId);
    const targetPath = path.join(folderAbs, file.fileName);
    moves.push({
      fileId: file.fileId,
      fileName: file.fileName,
      sourcePath: file.sourcePath,
      targetFolderId: folder.folderId,
      targetPath,
      reason,
      statusHint: 'planned',
      ...attachSceneFields(sceneDecision),
    });
    folder.expectedFileCount = (folder.expectedFileCount || 0) + 1;
  }

  return {
    schemeType: 'category',
    confidence,
    confidenceLevel,
    primaryBusinessCategory: null,
    reasons: [
      confidenceLevel === 'very_low'
        ? '业务置信度极低，采用待确认/保守策略'
        : '按文件类别整理，避免错误业务归类',
    ],
    folders,
    moves,
    uncertainFiles,
    protectedItems,
    warnings: confidenceLevel === 'very_low' ? ['大量文件进入待确认文件'] : [],
  };
}

function buildBusinessScheme({
  targetRoot,
  files,
  protectedItems,
  confidence,
  confidenceLevel,
  primaryBusinessCategory,
  sceneDecisions,
  objectDecisions,
  semanticDecisions,
}) {
  const businessName = BUSINESS_WHITELIST.includes(primaryBusinessCategory) ? primaryBusinessCategory : null;
  if (!businessName) {
    return buildCategoryScheme({
      targetRoot,
      files,
      protectedItems,
      confidence,
      confidenceLevel: 'low',
      sceneDecisions,
      semanticDecisions,
    });
  }

  const businessFolder = buildFolder({
    displayName: businessName,
    pathName: businessName,
    folderType: 'business',
    expectedFileCount: 0,
    parentFolderId: null,
  });

  const uncertainFolder = buildFolder({
    displayName: '待确认文件',
    pathName: '待确认文件',
    folderType: 'uncertain',
    expectedFileCount: 0,
    parentFolderId: null,
  });

  const folderByScene = new Map();
  const folders = [businessFolder, uncertainFolder];

  for (const file of files) {
    const sceneDecision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    if (semanticDecision?.semanticLayer !== 'scenario') continue;
    if (!sceneDecision?.sceneCategory || folderByScene.has(sceneDecision.sceneCategory)) continue;
    const safeName = sanitizePathName(sceneDecision.sceneCategory);
    if (!safeName) continue;
    const sceneFolder = buildFolder({
      displayName: sceneDecision.sceneCategory,
      pathName: safeName,
      folderType: 'scenario',
      expectedFileCount: 0,
      parentFolderId: null,
    });
    folderByScene.set(sceneDecision.sceneCategory, sceneFolder);
    folders.push(sceneFolder);
  }

  const folderAbsMap = folderPathMap(targetRoot, folders);
  const moves = [];
  const uncertainFiles = [];

  for (const file of files) {
    const sceneDecision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    const objectDecision = objectDecisions?.get(file.fileId);

    if (
      semanticDecision?.semanticLayer === 'scenario' &&
      sceneDecision?.sceneCategory &&
      folderByScene.has(sceneDecision.sceneCategory)
    ) {
      const sceneFolder = folderByScene.get(sceneDecision.sceneCategory);
      const targetPath = path.join(folderAbsMap.get(sceneFolder.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: sceneFolder.folderId,
        targetPath,
        reason: `场景命中 ${sceneDecision.sceneCategory}`,
        statusHint: 'planned',
        ...attachSceneFields(sceneDecision),
      });
      sceneFolder.expectedFileCount += 1;
      continue;
    }

    const score = objectDecision?.businessSignal || getFileBusinessScore(file.fileName);
    if (score.category === businessName && score.score >= 0.25) {
      const targetPath = path.join(folderAbsMap.get(businessFolder.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: businessFolder.folderId,
        targetPath,
        reason: `业务特征命中 ${businessName}`,
        statusHint: 'planned',
        ...attachSceneFields(sceneDecision),
      });
      businessFolder.expectedFileCount += 1;
    } else {
      uncertainFiles.push(
        attachUncertainFileSceneFields(
          {
            fileName: file.fileName,
            sourcePath: file.sourcePath,
            reason: score.category ? `业务信号不足（${score.category} ${score.score.toFixed(2)}）` : '缺少稳定业务信号',
          },
          sceneDecision
        )
      );
      const targetPath = path.join(folderAbsMap.get(uncertainFolder.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: uncertainFolder.folderId,
        targetPath,
        reason: semanticDecision?.downgradeReason || '低置信度文件进入待确认',
        statusHint: 'uncertain',
        ...attachSceneFields(sceneDecision),
      });
      uncertainFolder.expectedFileCount += 1;
    }
  }

  return {
    schemeType: 'business',
    confidence,
    confidenceLevel,
    primaryBusinessCategory: businessName,
    reasons: [`主业务特征命中 ${businessName}`],
    folders,
    moves,
    uncertainFiles,
    protectedItems,
    warnings: uncertainFiles.length > 0 ? ['部分文件进入待确认文件'] : [],
  };
}

function buildBusinessCategoryScheme({
  targetRoot,
  files,
  protectedItems,
  confidence,
  confidenceLevel,
  primaryBusinessCategory,
  sceneDecisions,
  objectDecisions,
  semanticDecisions,
}) {
  const businessName = BUSINESS_WHITELIST.includes(primaryBusinessCategory) ? primaryBusinessCategory : null;
  if (!businessName) {
    return buildCategoryScheme({
      targetRoot,
      files,
      protectedItems,
      confidence,
      confidenceLevel: 'low',
      sceneDecisions,
      semanticDecisions,
    });
  }

  const parent = buildFolder({
    displayName: businessName,
    pathName: businessName,
    folderType: 'business_category_parent',
    expectedFileCount: 0,
    parentFolderId: null,
  });

  const childByCategory = new Map();
  const folderByScene = new Map();
  const folders = [parent];

  for (const [category, displayName] of Object.entries(CATEGORY_LABELS)) {
    const safeName = sanitizePathName(displayName);
    if (!safeName) continue;
    const child = buildFolder({
      displayName,
      pathName: safeName,
      folderType: 'business_category_child',
      parentFolderId: parent.folderId,
      expectedFileCount: 0,
    });
    childByCategory.set(category, child);
    folders.push(child);
  }

  const uncertainFolder = buildFolder({
    displayName: '待确认文件',
    pathName: '待确认文件',
    folderType: 'uncertain',
    expectedFileCount: 0,
    parentFolderId: null,
  });
  folders.push(uncertainFolder);

  for (const file of files) {
    const sceneDecision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    if (semanticDecision?.semanticLayer !== 'scenario') continue;
    if (!sceneDecision?.sceneCategory || folderByScene.has(sceneDecision.sceneCategory)) continue;
    const safeName = sanitizePathName(sceneDecision.sceneCategory);
    if (!safeName) continue;
    const sceneFolder = buildFolder({
      displayName: sceneDecision.sceneCategory,
      pathName: safeName,
      folderType: 'scenario',
      expectedFileCount: 0,
      parentFolderId: null,
    });
    folderByScene.set(sceneDecision.sceneCategory, sceneFolder);
    folders.push(sceneFolder);
  }

  const folderAbsMap = folderPathMap(targetRoot, folders);
  const moves = [];
  const uncertainFiles = [];

  for (const file of files) {
    const sceneDecision = sceneDecisions?.get(file.fileId);
    const semanticDecision = semanticDecisions?.get(file.fileId);
    const objectDecision = objectDecisions?.get(file.fileId);

    if (
      semanticDecision?.semanticLayer === 'scenario' &&
      sceneDecision?.sceneCategory &&
      folderByScene.has(sceneDecision.sceneCategory)
    ) {
      const sceneFolder = folderByScene.get(sceneDecision.sceneCategory);
      const targetPath = path.join(folderAbsMap.get(sceneFolder.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: sceneFolder.folderId,
        targetPath,
        reason: `场景命中 ${sceneDecision.sceneCategory}`,
        statusHint: 'planned',
        ...attachSceneFields(sceneDecision),
      });
      sceneFolder.expectedFileCount += 1;
      continue;
    }

    const score = objectDecision?.businessSignal || getFileBusinessScore(file.fileName);
    if (score.category === businessName && score.score >= 0.2) {
      const category = CATEGORY_LABELS[file.category] ? file.category : 'other';
      const child = childByCategory.get(category);
      const targetPath = path.join(folderAbsMap.get(child.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: child.folderId,
        targetPath,
        reason: `命中${businessName}并按类别细分`,
        statusHint: 'planned',
        ...attachSceneFields(sceneDecision),
      });
      child.expectedFileCount += 1;
      parent.expectedFileCount += 1;
    } else if (score.score < 0.1) {
      uncertainFiles.push(
        attachUncertainFileSceneFields(
          {
            fileName: file.fileName,
            sourcePath: file.sourcePath,
            reason: '业务信号极低，进入待确认',
          },
          sceneDecision
        )
      );
      const targetPath = path.join(folderAbsMap.get(uncertainFolder.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: uncertainFolder.folderId,
        targetPath,
        reason: semanticDecision?.downgradeReason || '极低置信度文件进入待确认',
        statusHint: 'uncertain',
        ...attachSceneFields(sceneDecision),
      });
      uncertainFolder.expectedFileCount += 1;
    } else {
      const category = CATEGORY_LABELS[file.category] ? file.category : 'other';
      const child = childByCategory.get(category);
      const targetPath = path.join(folderAbsMap.get(child.folderId), file.fileName);
      moves.push({
        fileId: file.fileId,
        fileName: file.fileName,
        sourcePath: file.sourcePath,
        targetFolderId: child.folderId,
        targetPath,
        reason: '中等置信度文件按类别归档',
        statusHint: 'planned',
        ...attachSceneFields(sceneDecision),
      });
      child.expectedFileCount += 1;
      parent.expectedFileCount += 1;
    }
  }

  return {
    schemeType: 'business_category',
    confidence,
    confidenceLevel,
    primaryBusinessCategory: businessName,
    reasons: [`业务特征中等，按 ${businessName} + 类别二级整理`],
    folders,
    moves,
    uncertainFiles,
    protectedItems,
    warnings: uncertainFiles.length > 0 ? ['低置信度文件进入待确认文件'] : [],
  };
}

function normalizeScheme({
  base,
  profile,
  files,
  targetRoot,
  suffix,
  decisionTraceMode = null,
  objectDecisions = null,
  semanticDecisions = null,
}) {
  const normalizedProtectedItems = (base.protectedItems || []).map((item) => ({
    path: item.path,
    reason: item.reason,
  }));

  const schemeId = hash(`scheme:${profile.profileId}:${base.schemeType}:${suffix}`);
  const scheme = {
    schemeId,
    schemeType: base.schemeType,
    confidence: Number(base.confidence.toFixed(4)),
    confidenceLevel: base.confidenceLevel,
    primaryBusinessCategory: base.primaryBusinessCategory ?? null,
    reasons: base.reasons || [],
    folders: base.folders || [],
    moves: base.moves || [],
    uncertainFiles: base.uncertainFiles || [],
    protectedItems: normalizedProtectedItems,
    warnings: base.warnings || [],
  };

  if (decisionTraceMode) {
    const foldersById = new Map((scheme.folders || []).map((folder) => [folder.folderId, folder]));
    scheme.decisionTrace = buildDecisionTrace({
      mode: decisionTraceMode,
      files,
      scheme,
      objectDecisions,
      semanticDecisions,
      foldersById,
    });
    if (scheme.decisionTrace.entries.length !== files.length) {
      throw new Error(
        `Decision trace must cover all files: ${scheme.decisionTrace.entries.length}/${files.length}`
      );
    }
  }

  // 禁止隐藏目录名 + 必须 pathName 安全
  for (const folder of scheme.folders) {
    const safe = sanitizePathName(folder.pathName);
    if (!safe) {
      throw new Error(`Invalid folder pathName: ${folder.pathName}`);
    }
    folder.pathName = safe;
  }

  // 强制 moves 使用 fileId/sourcePath，不允许按文件名查找
  const sourcePathSet = new Set(files.map((f) => f.sourcePath));
  for (const move of scheme.moves) {
    if (!move.fileId || !move.sourcePath) {
      throw new Error('Move must include fileId and sourcePath');
    }
    if (!sourcePathSet.has(move.sourcePath)) {
      throw new Error(`Move sourcePath not found in profile files: ${move.sourcePath}`);
    }
  }

  schemaValidator.assertValid('organization-scheme.schema.json', scheme, 'OrganizationScheme validation failed');
  return scheme;
}

function pickPrimaryBusiness(profile) {
  const signal = profile.businessSignals?.[0];
  if (signal && BUSINESS_WHITELIST.includes(signal.category)) return signal.category;
  return null;
}

function applyPreferenceMemory({ schemes, recommendedSchemeId, profile, preferenceMemory }) {
  if (!preferenceMemory?.preferences) {
    return { schemes, recommendedSchemeId };
  }

  const prefs = preferenceMemory.preferences;
  const targetPath = profile?.target?.path;
  const preferredSchemeByPath = Array.isArray(prefs.preferredSchemeByPath) ? prefs.preferredSchemeByPath : [];
  const preferredRecord = preferredSchemeByPath.find((item) => item.path === targetPath);
  if (!preferredRecord?.schemeType) {
    return { schemes, recommendedSchemeId };
  }

  const matched = schemes.filter((scheme) => scheme.schemeType === preferredRecord.schemeType);
  if (matched.length === 0) {
    return { schemes, recommendedSchemeId };
  }

  const preferredSet = new Set(matched.map((scheme) => scheme.schemeId));
  const reordered = [
    ...matched.map((scheme) => ({
      ...scheme,
      reasons: [`命中历史偏好：该目录优先使用 ${preferredRecord.schemeType} 策略`, ...scheme.reasons],
    })),
    ...schemes.filter((scheme) => !preferredSet.has(scheme.schemeId)),
  ];

  return {
    schemes: reordered,
    recommendedSchemeId: reordered[0]?.schemeId || recommendedSchemeId,
  };
}

async function generateSchemes({ profile, files, preferenceMemory = null, options = {} }) {
  const targetRoot = profile.target.path;
  const primaryBusinessCategory = pickPrimaryBusiness(profile);
  const { confidence, confidenceLevel, schemeType } = resolveConfidence(profile);
  const decisionTraceMode = resolveDecisionTraceMode(options);
  const sceneDecisions = await sceneClassificationService.classifyFiles({
    files,
    profile,
    preferenceMemory,
    allowLightContent: true,
  });
  const objectDecisions = objectIdentificationService.identifyObjects({
    files,
    sceneDecisions,
    protectedItems: profile.protectedItems || [],
  });
  const semanticDecisions = semanticAttributionService.attributeSemantics({
    files,
    objectDecisions,
  });

  const builders = [];

  if (schemeType === 'business') {
    builders.push((suffix) =>
      normalizeScheme({
        base: buildBusinessScheme({
          targetRoot,
          files,
          protectedItems: profile.protectedItems || [],
          confidence,
          confidenceLevel,
          primaryBusinessCategory,
          sceneDecisions,
          objectDecisions,
          semanticDecisions,
        }),
        profile,
        files,
        targetRoot,
        suffix,
        decisionTraceMode,
        objectDecisions,
        semanticDecisions,
      })
    );
  } else if (schemeType === 'business_category') {
    builders.push((suffix) =>
      normalizeScheme({
        base: buildBusinessCategoryScheme({
          targetRoot,
          files,
          protectedItems: profile.protectedItems || [],
          confidence,
          confidenceLevel,
          primaryBusinessCategory,
          sceneDecisions,
          objectDecisions,
          semanticDecisions,
        }),
        profile,
        files,
        targetRoot,
        suffix,
        decisionTraceMode,
        objectDecisions,
        semanticDecisions,
      })
    );
  } else {
    builders.push((suffix) =>
      normalizeScheme({
        base: buildCategoryScheme({
          targetRoot,
          files,
          protectedItems: profile.protectedItems || [],
          confidence,
          confidenceLevel,
          sceneDecisions,
          semanticDecisions,
        }),
        profile,
        files,
        targetRoot,
        suffix,
        decisionTraceMode,
        objectDecisions,
        semanticDecisions,
      })
    );
  }

  // 备选方案：保守 category 和折中 business_category
  builders.push((suffix) =>
    normalizeScheme({
      base: buildCategoryScheme({
        targetRoot,
        files,
        protectedItems: profile.protectedItems || [],
        confidence: Math.min(confidence, 0.45),
        confidenceLevel: confidenceLevel === 'very_low' ? 'very_low' : 'low',
        sceneDecisions,
        semanticDecisions,
      }),
      profile,
      files,
      targetRoot,
      suffix,
      decisionTraceMode,
      objectDecisions,
      semanticDecisions,
    })
  );

  if (primaryBusinessCategory) {
    builders.push((suffix) =>
      normalizeScheme({
        base: buildBusinessCategoryScheme({
          targetRoot,
          files,
          protectedItems: profile.protectedItems || [],
          confidence: Math.max(0.35, confidence),
          confidenceLevel: confidenceLevel === 'very_high' ? 'high' : 'medium',
          primaryBusinessCategory,
          sceneDecisions,
          objectDecisions,
          semanticDecisions,
        }),
        profile,
        files,
        targetRoot,
        suffix,
        decisionTraceMode,
        objectDecisions,
        semanticDecisions,
      })
    );
  }

  const schemes = [];
  for (let i = 0; i < builders.length; i += 1) {
    const scheme = builders[i](`v${i + 1}`);
    if (!schemes.find((s) => s.schemeId === scheme.schemeId)) {
      schemes.push(scheme);
    }
  }

  const baseResult = {
    recommendedSchemeId: schemes[0]?.schemeId || null,
    schemes,
  };

  const preferredResult = applyPreferenceMemory({
    ...baseResult,
    profile,
    preferenceMemory,
  });

  const postProcessed = schemePostProcessService.postProcessSchemes({
    schemes: preferredResult.schemes,
    profile,
  });
  assertDecisionTraceCompleteness({
    schemes: postProcessed.schemes,
    files,
    mode: decisionTraceMode,
  });
  return postProcessed;
}

module.exports = {
  generateSchemes,
  BUSINESS_WHITELIST,
};
