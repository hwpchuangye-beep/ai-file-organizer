const path = require('path');
const sceneClassificationService = require('./sceneClassificationService.cjs');

const BUSINESS_WHITELIST = ['运营', '产品', '客户', '调研', '财务', '学习', '项目', '设计'];
const UNCERTAIN_FOLDER_NAME = '待确认文件';
const SCENE_WHITELIST = sceneClassificationService.SCENE_CATEGORIES;
const SCENE_POLICY_BY_NAME = sceneClassificationService.SCENE_POLICY_BY_NAME;
const SCENE_SOURCE_ENUM = sceneClassificationService.SCENE_SOURCE_ENUM;

function safeResolve(targetPath) {
  return path.resolve(String(targetPath || ''));
}

function isInsideRoot(targetRoot, candidatePath) {
  const root = safeResolve(targetRoot);
  const candidate = safeResolve(candidatePath);
  if (candidate === root) return true;
  return candidate.startsWith(`${root}${path.sep}`);
}

function isPathProtected(sourcePath, protectedPaths) {
  const normalized = safeResolve(sourcePath);
  return protectedPaths.some((protectedPath) => {
    const base = safeResolve(protectedPath);
    return normalized === base || normalized.startsWith(`${base}${path.sep}`);
  });
}

function expectedSchemeByConfidence(confidenceLevel) {
  if (confidenceLevel === 'medium') return 'business_category';
  if (confidenceLevel === 'low') return 'category';
  if (confidenceLevel === 'very_low') return 'category';
  return null;
}

function validateSceneDecisionFields(item, errors, fieldPrefix) {
  if (!item || typeof item !== 'object') return;

  if (item.sceneCategory === undefined) return;

  if (item.sceneCategory === null) {
    if (
      item.sceneConfidence !== undefined ||
      item.sceneEvidence !== undefined ||
      item.sceneAnalysisUsed !== undefined ||
      item.sceneKind !== undefined
    ) {
      errors.push({
        code: 'SCENE_NULL_WITH_EXTRA_FIELDS',
        message: `${fieldPrefix} sceneCategory=null 时不能包含 sceneConfidence/sceneEvidence/sceneAnalysisUsed/sceneKind`,
        field: fieldPrefix,
      });
    }
    return;
  }

  if (!SCENE_WHITELIST.includes(item.sceneCategory)) {
    errors.push({
      code: 'SCENE_CATEGORY_NOT_WHITELISTED',
      message: `${fieldPrefix} sceneCategory 不在白名单: ${item.sceneCategory}`,
      field: `${fieldPrefix}.sceneCategory`,
    });
    return;
  }

  if (typeof item.sceneConfidence !== 'number' || item.sceneConfidence < 0 || item.sceneConfidence > 1) {
    errors.push({
      code: 'SCENE_CONFIDENCE_INVALID',
      message: `${fieldPrefix} sceneConfidence 必须在 0~1 之间`,
      field: `${fieldPrefix}.sceneConfidence`,
    });
  }

  if (typeof item.sceneAnalysisUsed !== 'boolean') {
    errors.push({
      code: 'SCENE_ANALYSIS_USED_REQUIRED',
      message: `${fieldPrefix} 命中场景时必须输出 sceneAnalysisUsed`,
      field: `${fieldPrefix}.sceneAnalysisUsed`,
    });
  }

  if (!item.sceneEvidence || typeof item.sceneEvidence !== 'object') {
    errors.push({
      code: 'SCENE_EVIDENCE_REQUIRED',
      message: `${fieldPrefix} 命中场景时必须输出 sceneEvidence`,
      field: `${fieldPrefix}.sceneEvidence`,
    });
    return;
  }

  if (!SCENE_SOURCE_ENUM.includes(item.sceneEvidence.source)) {
    errors.push({
      code: 'SCENE_EVIDENCE_SOURCE_INVALID',
      message: `${fieldPrefix} sceneEvidence.source 非法`,
      field: `${fieldPrefix}.sceneEvidence.source`,
    });
  }

  if (!Array.isArray(item.sceneEvidence.signals) || item.sceneEvidence.signals.length === 0) {
    errors.push({
      code: 'SCENE_EVIDENCE_SIGNALS_REQUIRED',
      message: `${fieldPrefix} sceneEvidence.signals 至少要有 1 条`,
      field: `${fieldPrefix}.sceneEvidence.signals`,
    });
  }

  const policy = SCENE_POLICY_BY_NAME.get(item.sceneCategory);
  if (!policy) return;

  if (item.sceneKind !== policy.sceneKind) {
    errors.push({
      code: 'SCENE_KIND_MISMATCH',
      message: `${fieldPrefix} ${item.sceneCategory} 的 sceneKind 必须为 ${policy.sceneKind}`,
      field: `${fieldPrefix}.sceneKind`,
    });
  }

  const signalCount = Number(item.sceneEvidence.signalCount || item.sceneEvidence.signals?.length || 0);
  const minEvidenceCount = Number(policy.minEvidenceCount || 1);
  const minScore = Number(policy.minScore || 0);

  if (signalCount < minEvidenceCount) {
    errors.push({
      code: 'SCENE_EVIDENCE_BELOW_THRESHOLD',
      message: `${fieldPrefix} ${item.sceneCategory} 证据数量不足（${signalCount} < ${minEvidenceCount}）`,
      field: `${fieldPrefix}.sceneEvidence.signalCount`,
    });
  }

  if (Number(item.sceneConfidence || 0) < minScore) {
    errors.push({
      code: 'SCENE_CONFIDENCE_BELOW_THRESHOLD',
      message: `${fieldPrefix} ${item.sceneCategory} 置信度低于阈值（${item.sceneConfidence} < ${minScore}）`,
      field: `${fieldPrefix}.sceneConfidence`,
    });
  }

  if (policy.tier === 'B' && (signalCount < minEvidenceCount || Number(item.sceneConfidence || 0) < minScore)) {
    errors.push({
      code: 'SCENE_B_TIER_NEEDS_DOWNGRADE',
      message: `${fieldPrefix} B级场景证据不足，应降级到业务/通用类别`,
      field: fieldPrefix,
    });
  }
}

function validateOrganizationSchemeRules({ scheme, profile, files, targetRoot }) {
  const errors = [];

  if (!scheme || typeof scheme !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_INPUT', message: '缺少有效的 scheme 对象' }],
    };
  }

  if (!targetRoot) {
    return {
      valid: false,
      errors: [{ code: 'INVALID_INPUT', message: '缺少 targetRoot' }],
    };
  }

  const expectedScheme = expectedSchemeByConfidence(scheme.confidenceLevel);
  if (expectedScheme && scheme.schemeType !== expectedScheme) {
    errors.push({
      code: 'CONFIDENCE_STRATEGY_VIOLATION',
      message: `置信度 ${scheme.confidenceLevel} 必须使用 ${expectedScheme} 策略`,
      field: 'schemeType',
    });
  }

  if (scheme.confidenceLevel === 'very_low') {
    const hasUncertainMoves = (scheme.moves || []).some((move) => move.statusHint === 'uncertain');
    if ((scheme.uncertainFiles || []).length === 0 && !hasUncertainMoves) {
      errors.push({
        code: 'VERY_LOW_CONFIDENCE_NOT_CONSERVATIVE',
        message: '极低置信度方案必须包含待确认文件',
        field: 'uncertainFiles',
      });
    }

    const hasPlannedMove = (scheme.moves || []).some((move) => move.statusHint === 'planned');
    if (hasPlannedMove) {
      errors.push({
        code: 'VERY_LOW_CONFIDENCE_AUTO_MOVE_FORBIDDEN',
        message: '极低置信度方案禁止自动移动文件',
        field: 'moves',
      });
    }
  }

  const folderById = new Map();
  const folderAbsById = new Map();
  const resolving = new Set();

  for (const folder of scheme.folders || []) {
    if (folderById.has(folder.folderId)) {
      errors.push({
        code: 'DUPLICATE_FOLDER_ID',
        message: `重复 folderId: ${folder.folderId}`,
        field: 'folders',
      });
      continue;
    }

    folderById.set(folder.folderId, folder);

    if (!folder.pathName || String(folder.pathName).trim() === '') {
      errors.push({
        code: 'INVALID_FOLDER_NAME',
        message: `目录名为空: ${folder.folderId}`,
        field: 'folders.pathName',
      });
      continue;
    }

    if (folder.pathName.startsWith('.')) {
      errors.push({
        code: 'HIDDEN_FOLDER_FORBIDDEN',
        message: `禁止创建隐藏目录: ${folder.pathName}`,
        field: 'folders.pathName',
      });
    }

    if (folder.pathName.includes('/') || folder.pathName.includes('\\')) {
      errors.push({
        code: 'INVALID_FOLDER_PATHNAME',
        message: `目录名不能包含路径分隔符: ${folder.pathName}`,
        field: 'folders.pathName',
      });
    }

    if (
      (folder.folderType === 'business' || folder.folderType === 'business_category_parent') &&
      !BUSINESS_WHITELIST.includes(folder.pathName)
    ) {
      errors.push({
        code: 'BUSINESS_NAME_NOT_WHITELISTED',
        message: `业务目录名不在白名单: ${folder.pathName}`,
        field: 'folders.pathName',
      });
    }

    if (folder.folderType === 'uncertain' && folder.pathName !== UNCERTAIN_FOLDER_NAME) {
      errors.push({
        code: 'UNCERTAIN_FOLDER_NAME_INVALID',
        message: `待确认目录必须命名为 ${UNCERTAIN_FOLDER_NAME}`,
        field: 'folders.pathName',
      });
    }

    if (folder.folderType === 'scenario' && !SCENE_WHITELIST.includes(folder.pathName)) {
      errors.push({
        code: 'SCENE_FOLDER_NOT_WHITELISTED',
        message: `场景目录名不在白名单: ${folder.pathName}`,
        field: 'folders.pathName',
      });
    }
  }

  function resolveFolderAbs(folderId) {
    if (folderAbsById.has(folderId)) return folderAbsById.get(folderId);
    const folder = folderById.get(folderId);
    if (!folder) return null;
    if (resolving.has(folderId)) {
      errors.push({
        code: 'FOLDER_PARENT_CYCLE',
        message: `目录父子关系存在循环: ${folderId}`,
        field: 'folders.parentFolderId',
      });
      return null;
    }
    resolving.add(folderId);

    let absPath = null;
    if (!folder.parentFolderId) {
      absPath = path.join(targetRoot, folder.pathName);
    } else {
      const parentAbs = resolveFolderAbs(folder.parentFolderId);
      if (!parentAbs) {
        errors.push({
          code: 'PARENT_FOLDER_NOT_FOUND',
          message: `未找到父目录: ${folder.parentFolderId}`,
          field: 'folders.parentFolderId',
        });
      } else {
        absPath = path.join(parentAbs, folder.pathName);
      }
    }

    resolving.delete(folderId);
    if (absPath) {
      folderAbsById.set(folderId, absPath);
    }
    return absPath;
  }

  for (const folder of scheme.folders || []) {
    const absPath = resolveFolderAbs(folder.folderId);
    if (!absPath) continue;
    if (!isInsideRoot(targetRoot, absPath)) {
      errors.push({
        code: 'TARGET_PATH_ESCAPE',
        message: `目录路径逃逸 targetRoot: ${absPath}`,
        field: 'folders',
      });
    }
  }

  const fileBySourcePath = new Map();
  const fileById = new Map();
  for (const file of files || []) {
    if (!file?.sourcePath || !file?.fileId) continue;
    fileBySourcePath.set(file.sourcePath, file);
    fileById.set(file.fileId, file);
  }

  const protectedPaths = (profile?.protectedItems || scheme.protectedItems || []).map((item) => item.path);

  for (const [index, uncertain] of (scheme.uncertainFiles || []).entries()) {
    validateSceneDecisionFields(uncertain, errors, `uncertainFiles[${index}]`);
  }

  for (const [index, move] of (scheme.moves || []).entries()) {
    validateSceneDecisionFields(move, errors, `moves[${index}]`);

    if (!move.fileId || !move.sourcePath) {
      errors.push({
        code: 'MOVE_IDENTITY_REQUIRED',
        message: 'move 缺少 fileId/sourcePath，禁止按 fileName 绑定',
        field: 'moves',
      });
      continue;
    }

    const fileByPath = fileBySourcePath.get(move.sourcePath);
    if (!fileByPath) {
      errors.push({
        code: 'MOVE_SOURCE_NOT_IN_PROFILE',
        message: `move.sourcePath 不在扫描文件集中: ${move.sourcePath}`,
        field: 'moves.sourcePath',
      });
      continue;
    }

    if (fileByPath.fileId !== move.fileId) {
      errors.push({
        code: 'MOVE_FILE_ID_MISMATCH',
        message: `fileId 与 sourcePath 不匹配: ${move.fileName}`,
        field: 'moves.fileId',
      });
    }

    if (!fileById.has(move.fileId)) {
      errors.push({
        code: 'MOVE_FILE_ID_NOT_IN_PROFILE',
        message: `move.fileId 不在扫描文件集中: ${move.fileId}`,
        field: 'moves.fileId',
      });
    }

    if (isPathProtected(move.sourcePath, protectedPaths)) {
      errors.push({
        code: 'PROTECTED_SOURCE_FORBIDDEN',
        message: `保护目录内文件禁止移动: ${move.sourcePath}`,
        field: 'moves.sourcePath',
      });
      continue;
    }

    const folderAbs = folderAbsById.get(move.targetFolderId);
    if (!folderAbs) {
      errors.push({
        code: 'MOVE_TARGET_FOLDER_NOT_FOUND',
        message: `move.targetFolderId 不存在: ${move.targetFolderId}`,
        field: 'moves.targetFolderId',
      });
      continue;
    }

    const expectedTargetPath = safeResolve(path.join(folderAbs, move.fileName));
    const plannedTargetPath = safeResolve(move.targetPath);

    if (plannedTargetPath !== expectedTargetPath) {
      errors.push({
        code: 'MOVE_TARGET_MISMATCH',
        message: `move.targetPath 与目录映射不一致: ${move.targetPath}`,
        field: 'moves.targetPath',
      });
    }

    if (!isInsideRoot(targetRoot, plannedTargetPath)) {
      errors.push({
        code: 'MOVE_TARGET_ESCAPE',
        message: `move.targetPath 逃逸 targetRoot: ${move.targetPath}`,
        field: 'moves.targetPath',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  BUSINESS_WHITELIST,
  validateOrganizationSchemeRules,
};
