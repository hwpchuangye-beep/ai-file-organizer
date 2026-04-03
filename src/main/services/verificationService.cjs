const fs = require('fs').promises;
const path = require('path');
const schemaValidator = require('./schemaValidatorService.cjs');

const ALLOWED_FAILED_CODES = new Set([
  'SOURCE_NOT_FOUND',
  'TARGET_DIR_NOT_FOUND',
  'TARGET_DIR_CREATE_FAILED',
  'MOVE_FAILED',
  'PERMISSION_DENIED',
  'FILE_IN_USE',
  'PATH_PARSE_ERROR',
  'CROSS_VOLUME_MOVE_FAILED',
  'SPECIAL_CHAR_PATH_ERROR',
  'UNKNOWN_ERROR',
]);

function normalizeFailedCode(code) {
  if (ALLOWED_FAILED_CODES.has(code)) return code;
  return 'UNKNOWN_ERROR';
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRealPathSafe(filePath) {
  try {
    return await fs.realpath(filePath);
  } catch {
    return null;
  }
}

function extractSceneFields(item) {
  if (!item || typeof item !== 'object') return {};
  const out = {};
  if (Object.prototype.hasOwnProperty.call(item, 'sceneCategory')) out.sceneCategory = item.sceneCategory;
  if (item.sceneKind !== undefined) out.sceneKind = item.sceneKind;
  if (item.sceneConfidence !== undefined) out.sceneConfidence = item.sceneConfidence;
  if (item.sceneEvidence !== undefined) out.sceneEvidence = item.sceneEvidence;
  if (item.sceneAnalysisUsed !== undefined) out.sceneAnalysisUsed = item.sceneAnalysisUsed;
  return out;
}

async function verifyExecution({ task, receipt }) {
  const successFiles = [];
  const failedFiles = [];
  const skippedFiles = [];

  for (const item of receipt.moves || []) {
    if (item.status === 'success') {
      const targetExists = await exists(item.targetPath);
      const sourceStillExists = await exists(item.sourcePath);
      const realPath = await resolveRealPathSafe(item.targetPath);
      const parentRealPath = await resolveRealPathSafe(path.dirname(item.targetPath));
      const canonicalFromDisplay = parentRealPath ? path.join(parentRealPath, path.basename(item.targetPath)) : null;
      const pathConsistent =
        Boolean(realPath) &&
        Boolean(canonicalFromDisplay) &&
        path.resolve(realPath) === path.resolve(canonicalFromDisplay);

      if (targetExists && pathConsistent && !sourceStillExists) {
        successFiles.push({
          fileName: item.fileName,
          sourcePath: item.sourcePath,
          targetPath: item.targetPath,
          targetFolderName: item.targetFolderName || path.basename(path.dirname(item.targetPath)),
          reason: item.reason || '执行成功',
          ...extractSceneFields(item),
        });
      } else {
        let errorCode = 'MOVE_FAILED';
        let errorMessage = '执行记录为成功但目标文件不存在';

        if (targetExists && !pathConsistent) {
          errorCode = 'PATH_PARSE_ERROR';
          errorMessage = '展示路径与磁盘实际路径不一致';
        } else if (sourceStillExists) {
          errorCode = 'MOVE_FAILED';
          errorMessage = '源路径仍存在，移动未完整生效';
        }

        failedFiles.push({
          fileName: item.fileName,
          sourcePath: item.sourcePath,
          targetPath: item.targetPath,
          errorCode,
          errorMessage,
          stillAtOriginalPath: sourceStillExists,
        });
      }
      continue;
    }

    if (item.status === 'failed') {
      failedFiles.push({
        fileName: item.fileName,
        sourcePath: item.sourcePath,
        targetPath: item.targetPath || '',
        errorCode: normalizeFailedCode(item.errorCode),
        errorMessage: item.errorMessage || '未知错误',
        stillAtOriginalPath: item.stillAtOriginalPath !== undefined ? item.stillAtOriginalPath : await exists(item.sourcePath),
      });
      continue;
    }

    skippedFiles.push({
      fileName: item.fileName,
      sourcePath: item.sourcePath,
      reason: item.reason || '跳过',
      ...extractSceneFields(item),
    });
  }

  const createdFolders = (receipt.createdFolders || []).map((folderPath) => ({
    displayName: path.basename(folderPath) || folderPath,
    path: folderPath,
  }));

  const executedCount = successFiles.length + failedFiles.length;
  const report = {
    taskId: task.taskId,
    summary: {
      scannedCount: receipt.scannedCount || task.plannedMoveCount || 0,
      plannedCount: task.plannedMoveCount || 0,
      executedCount,
      successCount: successFiles.length,
      failedCount: failedFiles.length,
      skippedCount: skippedFiles.length,
    },
    successFiles,
    failedFiles,
    skippedFiles,
    createdFolders,
  };

  schemaValidator.assertValid('verification-report.schema.json', report, 'VerificationReport validation failed');
  return report;
}

module.exports = {
  verifyExecution,
};
