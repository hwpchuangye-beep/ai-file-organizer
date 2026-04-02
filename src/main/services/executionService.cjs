/**
 * 执行服务 - 处理真实的文件操作
 * 核心修复版：精确错误分类、子目录正确处理、统计一致性
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// 任务存储目录
const TASKS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'tasks');
const LOGS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'logs');

/**
 * 错误码映射：将系统错误码映射为业务错误码
 */
const ERROR_CODE_MAPPING = {
  // 文件已存在
  EEXIST: 'DUPLICATE_NAME',
  // 权限问题
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  // 路径不存在（需进一步细分是源还是目标）
  ENOENT: 'PATH_NOT_FOUND',
  // 文件被占用
  EBUSY: 'FILE_LOCKED',
  // 跨卷移动
  EXDEV: 'CROSS_VOLUME_MOVE',
  // 磁盘空间不足
  ENOSPC: 'DISK_FULL',
  // 目录不为空
  ENOTEMPTY: 'DIR_NOT_EMPTY',
  // 目标是目录
  EISDIR: 'IS_DIRECTORY',
  // 路径不是目录
  ENOTDIR: 'NOT_DIRECTORY',
  // 无效参数
  EINVAL: 'INVALID_PATH',
  // 只读文件系统
  EROFS: 'READONLY_FS',
  // 文件名过长
  ENAMETOOLONG: 'NAME_TOO_LONG',
};

/**
 * 建议操作映射
 */
const SUGGESTION_MAPPING = {
  DUPLICATE_NAME: '目标位置已存在同名文件，请手动处理冲突',
  PERMISSION_DENIED: '权限不足，请检查文件/文件夹权限，或以管理员身份运行',
  SOURCE_NOT_FOUND: '源文件在移动前已被删除或移动，请检查文件是否存在',
  TARGET_DIR_NOT_FOUND: '目标目录不存在且无法创建',
  TARGET_DIR_CREATE_FAILED: '创建目标目录失败，请检查路径权限和磁盘空间',
  MOVE_FAILED: '文件移动操作失败，可能文件系统不兼容',
  FILE_LOCKED: '文件正被其他程序占用，请关闭相关程序后重试',
  CROSS_VOLUME_MOVE: '跨卷移动失败，请检查磁盘空间和权限',
  CROSS_VOLUME_FAILED: '跨卷移动失败，请检查磁盘空间和权限',
  DISK_FULL: '磁盘空间不足，请清理磁盘后重试',
  DIR_NOT_EMPTY: '目标目录不为空，无法覆盖',
  IS_DIRECTORY: '目标是目录而非文件，无法覆盖',
  NOT_DIRECTORY: '目标路径的父目录不是有效的目录',
  INVALID_PATH: '路径包含非法字符或格式无效',
  READONLY_FS: '文件系统为只读，无法写入',
  NAME_TOO_LONG: '文件名过长，请缩短文件名',
  PATH_NOT_FOUND: '路径不存在',
  UNKNOWN: '未知错误，请检查错误详情后手动处理',
};

/**
 * 日志记录器类
 */
class OperationLogger {
  constructor(taskId) {
    this.taskId = taskId;
    this.logs = [];
    this.logFile = path.join(LOGS_DIR, `${taskId}.log`);
  }

  async log(level, message, details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, details };
    this.logs.push(logEntry);

    const consoleMsg = `[${timestamp}] [${level}] ${message}`;
    if (level === 'ERROR') console.error(consoleMsg, details || '');
    else if (level === 'WARN') console.warn(consoleMsg, details || '');
    else console.log(consoleMsg, details || '');

    await this.writeToFile(logEntry);
  }

  async info(message, details = null) { await this.log('INFO', message, details); }
  async warn(message, details = null) { await this.log('WARN', message, details); }
  async error(message, details = null) { await this.log('ERROR', message, details); }

  async writeToFile(logEntry) {
    try {
      await fs.mkdir(LOGS_DIR, { recursive: true });
      await fs.appendFile(this.logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
    } catch (e) {
      console.error('写入日志失败:', e);
    }
  }

  getLogs() { return this.logs; }
}

/**
 * 精确错误分类器
 * @param {Error} error - 错误对象
 * @param {string} context - 错误上下文 ('source_check' | 'target_dir_create' | 'move' | 'cross_volume')
 * @param {string} sourcePath - 源文件路径
 * @param {string} targetPath - 目标文件路径
 * @returns {Object} - 精确错误分类
 */
function classifyError(error, context = 'unknown', sourcePath = '', targetPath = '') {
  const systemCode = error.code || 'UNKNOWN';
  const baseErrorCode = ERROR_CODE_MAPPING[systemCode] || 'UNKNOWN';
  
  // 根据上下文细分错误
  let errorCode = baseErrorCode;
  let userMessage = '未知错误';
  
  // 针对 ENOENT 的细分
  if (systemCode === 'ENOENT') {
    if (context === 'source_check') {
      errorCode = 'SOURCE_NOT_FOUND';
      userMessage = '源文件不存在（可能已被删除或移动）';
    } else if (context === 'target_dir_create') {
      errorCode = 'TARGET_DIR_CREATE_FAILED';
      userMessage = '创建目标目录失败（父目录不存在或权限不足）';
    } else if (context === 'move') {
      // 移动时的 ENOENT 需要判断是源还是目标
      userMessage = '移动失败：路径不存在（源文件或目标目录可能已变更）';
    } else {
      errorCode = 'PATH_NOT_FOUND';
      userMessage = '路径不存在';
    }
  }
  // 权限错误细分
  else if (systemCode === 'EACCES' || systemCode === 'EPERM') {
    if (context === 'target_dir_create') {
      userMessage = '创建目录失败：权限不足，无法写入目标位置';
    } else if (context === 'move') {
      userMessage = '移动失败：权限不足（无法读取源文件或写入目标位置）';
    } else {
      userMessage = '权限不足，无法访问文件或目录';
    }
  }
  // 跨卷移动错误
  else if (systemCode === 'EXDEV') {
    errorCode = 'CROSS_VOLUME_MOVE';
    userMessage = '跨卷移动：源文件和目标位置位于不同磁盘';
  }
  // 文件已存在
  else if (systemCode === 'EEXIST') {
    userMessage = '目标位置已存在同名文件（重名冲突）';
  }
  // 文件被占用
  else if (systemCode === 'EBUSY') {
    userMessage = '文件被其他程序占用，无法移动';
  }
  // 磁盘空间不足
  else if (systemCode === 'ENOSPC') {
    userMessage = '磁盘空间不足，无法完成操作';
  }
  // 其他已知错误
  else if (systemCode === 'ENOTEMPTY') {
    userMessage = '目标目录不为空，无法覆盖';
  } else if (systemCode === 'EISDIR') {
    userMessage = '目标是目录而非文件';
  } else if (systemCode === 'ENOTDIR') {
    userMessage = '目标路径的父元素不是目录';
  } else if (systemCode === 'EINVAL') {
    userMessage = '路径包含非法字符或格式无效';
  } else if (systemCode === 'EROFS') {
    userMessage = '文件系统为只读';
  } else if (systemCode === 'ENAMETOOLONG') {
    userMessage = '文件名过长';
  } else {
    // 未知错误，保留原始消息
    userMessage = error.message || '未知错误';
  }

  return {
    systemCode,
    errorCode,
    context,
    userMessage,
    originalError: error.message,
    stack: error.stack,
    suggestion: SUGGESTION_MAPPING[errorCode] || SUGGESTION_MAPPING.UNKNOWN,
  };
}

/**
 * 检查源文件是否存在
 * @returns {Promise<{exists: boolean, error?: Object}>}
 */
async function checkSourceFile(sourcePath, logger) {
  try {
    await fs.access(sourcePath);
    const stats = await fs.stat(sourcePath);
    if (!stats.isFile()) {
      return {
        exists: false,
        error: {
          errorCode: 'SOURCE_NOT_FOUND',
          userMessage: '源路径不是文件（可能是目录）',
          suggestion: SUGGESTION_MAPPING.SOURCE_NOT_FOUND,
        }
      };
    }
    return { exists: true };
  } catch (error) {
    const errorInfo = classifyError(error, 'source_check', sourcePath, '');
    await logger.warn(`源文件不存在: ${sourcePath}`, errorInfo);
    return { exists: false, error: errorInfo };
  }
}

/**
 * 确保目标目录存在（递归创建）
 * @returns {Promise<{success: boolean, error?: Object}>}
 */
async function ensureTargetDir(targetDir, logger) {
  try {
    await logger.info(`检查/创建目标目录: ${targetDir}`);
    await fs.mkdir(targetDir, { recursive: true });
    
    // 验证目录确实被创建
    const stats = await fs.stat(targetDir);
    if (!stats.isDirectory()) {
      throw new Error('创建的路径不是目录');
    }
    
    await logger.info(`目标目录就绪: ${targetDir}`);
    return { success: true };
  } catch (error) {
    const errorInfo = classifyError(error, 'target_dir_create', '', targetDir);
    await logger.error(`创建目标目录失败: ${targetDir}`, errorInfo);
    return { success: false, error: errorInfo };
  }
}

/**
 * 安全地移动文件（支持跨卷）
 * @returns {Promise<{success: boolean, method?: string, error?: Object}>}
 */
async function safeMoveFile(sourcePath, targetPath, logger) {
  await logger.info(`准备移动: ${sourcePath} -> ${targetPath}`);

  // 1. 检查源文件
  const sourceCheck = await checkSourceFile(sourcePath, logger);
  if (!sourceCheck.exists) {
    return { success: false, error: sourceCheck.error };
  }

  // 2. 确保目标目录存在
  const targetDir = path.dirname(targetPath);
  const dirCheck = await ensureTargetDir(targetDir, logger);
  if (!dirCheck.success) {
    return { success: false, error: dirCheck.error };
  }

  // 3. 尝试移动
  try {
    // 首先尝试直接重命名（同卷，原子操作）
    await fs.rename(sourcePath, targetPath);
    await logger.info(`移动成功 (rename): ${sourcePath} -> ${targetPath}`);
    return { success: true, method: 'rename' };
  } catch (error) {
    const errorInfo = classifyError(error, 'move', sourcePath, targetPath);

    // 跨卷移动
    if (errorInfo.systemCode === 'EXDEV') {
      await logger.warn(`检测到跨卷移动，尝试 copy+unlink: ${sourcePath}`);
      return await crossDeviceMove(sourcePath, targetPath, logger);
    }

    // 重名冲突，尝试生成唯一文件名
    if (errorInfo.systemCode === 'EEXIST') {
      return await moveWithUniqueName(sourcePath, targetPath, logger);
    }

    // 其他错误
    await logger.error(`移动失败: ${sourcePath}`, errorInfo);
    return { success: false, error: errorInfo };
  }
}

/**
 * 使用唯一文件名移动（处理重名）
 */
async function moveWithUniqueName(sourcePath, targetPath, logger) {
  const targetDir = path.dirname(targetPath);
  const originalName = path.basename(targetPath);
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  
  let counter = 1;
  let finalTargetPath = targetPath;
  
  while (counter < 1000) { // 防止无限循环
    const newName = `${baseName} (${counter})${ext}`;
    finalTargetPath = path.join(targetDir, newName);
    
    try {
      await fs.access(finalTargetPath);
      counter++;
    } catch {
      // 文件不存在，可以使用这个名字
      break;
    }
  }
  
  try {
    await fs.rename(sourcePath, finalTargetPath);
    await logger.info(`移动成功 (重命名): ${sourcePath} -> ${finalTargetPath}`);
    return { 
      success: true, 
      method: 'rename-with-suffix',
      actualTarget: finalTargetPath,
      note: `原文件名冲突，已重命名为: ${path.basename(finalTargetPath)}`
    };
  } catch (error) {
    const errorInfo = classifyError(error, 'move', sourcePath, finalTargetPath);
    await logger.error(`重命名移动失败: ${sourcePath}`, errorInfo);
    return { success: false, error: errorInfo };
  }
}

/**
 * 跨卷移动（copy + unlink）
 */
async function crossDeviceMove(sourcePath, targetPath, logger) {
  try {
    // 复制文件
    await logger.info(`开始复制: ${sourcePath} -> ${targetPath}`);
    await fs.copyFile(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
    await logger.info(`复制成功: ${sourcePath} -> ${targetPath}`);

    // 删除源文件
    await logger.info(`删除源文件: ${sourcePath}`);
    await fs.unlink(sourcePath);
    await logger.info(`删除源文件成功: ${sourcePath}`);

    return { success: true, method: 'copy+unlink' };
  } catch (error) {
    const errorInfo = classifyError(error, 'cross_volume', sourcePath, targetPath);
    
    // 清理可能的部分复制
    try {
      await fs.access(targetPath);
      await fs.unlink(targetPath);
      await logger.warn(`清理部分复制的文件: ${targetPath}`);
    } catch {
      // 目标文件不存在，无需清理
    }
    
    await logger.error(`跨卷移动失败: ${sourcePath}`, errorInfo);
    return { success: false, error: { ...errorInfo, errorCode: 'CROSS_VOLUME_FAILED' } };
  }
}

/**
 * 生成执行统计报告
 */
function generateExecutionReport(stats) {
  const total = stats.attempted || 0;
  const success = stats.succeeded || 0;
  const failed = stats.failed || 0;
  const skipped = stats.skipped || 0;
  
  return {
    ...stats,
    consistency: {
      totalMatches: total === (success + failed + skipped),
      attempted: total,
      accounted: success + failed + skipped,
      discrepancy: total - (success + failed + skipped),
    }
  };
}

/**
 * 执行整理任务
 */
async function executeTask(taskPayload) {
  // 确保目录存在
  try {
    await fs.mkdir(TASKS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (e) {
    console.error('创建目录失败:', e);
  }

  const { taskId, targetPath, scheme } = taskPayload;
  const logger = new OperationLogger(taskId);

  // 统计信息
  const stats = {
    scanned: scheme.plannedMoves?.length || 0,      // 扫描到的文件数
    planned: 0,                                      // 计划处理数
    attempted: 0,                                    // 实际尝试数
    succeeded: 0,                                    // 成功数
    failed: 0,                                       // 失败数
    skipped: 0,                                      // 跳过数
  };

  await logger.info('========== 任务开始 ==========', {
    taskId,
    targetPath,
    schemeId: scheme.schemeId,
    scannedFiles: stats.scanned,
    suggestedFolders: scheme.suggestedFolders?.length || 0,
  });

  const result = {
    taskId,
    targetPath,
    schemeId: scheme.schemeId,
    stats,
    createdFolders: [],
    movedFiles: [],
    skippedFiles: [],
    failedFiles: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    logs: [],
  };

  try {
    // ========== 阶段1: 创建文件夹 ==========
    await logger.info('---------- 阶段1: 创建目标文件夹 ----------');
    
    for (const folderName of scheme.suggestedFolders || []) {
      const folderPath = path.join(targetPath, folderName);
      const dirResult = await ensureTargetDir(folderPath, logger);
      
      if (dirResult.success) {
        result.createdFolders.push(folderPath);
      } else {
        result.failedFiles.push({
          type: 'folder_create',
          name: folderName,
          target: folderPath,
          errorCode: dirResult.error.errorCode,
          reason: dirResult.error.userMessage,
          suggestion: dirResult.error.suggestion,
        });
        stats.failed++;
      }
    }

    await logger.info('文件夹创建完成', {
      created: result.createdFolders.length,
      failed: scheme.suggestedFolders?.length - result.createdFolders.length,
    });

    // ========== 阶段2: 移动文件 ==========
    await logger.info('---------- 阶段2: 移动文件 ----------');
    
    // 先统计计划处理的文件（排除无效数据）
    const validMoves = (scheme.plannedMoves || []).filter(m => m && m.file && m.file.path);
    stats.planned = validMoves.length;
    
    await logger.info('计划处理文件统计', {
      scanned: stats.scanned,
      valid: stats.planned,
      invalid: stats.scanned - stats.planned,
    });

    for (const move of validMoves) {
      const { file, targetFolder } = move;
      stats.attempted++;

      // 构建目标路径
      const targetFolderPath = path.join(targetPath, targetFolder);
      const targetFilePath = path.join(targetFolderPath, file.name);

      await logger.info(`[${stats.attempted}/${stats.planned}] 处理文件`, {
        name: file.name,
        source: file.path,
        target: targetFilePath,
      });

      // 执行移动
      const moveResult = await safeMoveFile(file.path, targetFilePath, logger);

      if (moveResult.success) {
        // 成功
        stats.succeeded++;
        result.movedFiles.push({
          name: file.name,
          source: file.path,
          target: moveResult.actualTarget || targetFilePath,
          method: moveResult.method,
          note: moveResult.note || null,
        });
        await logger.info(`✓ 移动成功: ${file.name}`, { method: moveResult.method });
      } else {
        // 失败
        stats.failed++;
        
        // 检查源文件是否仍在原位置
        let existsInSource = false;
        try {
          await fs.access(file.path);
          existsInSource = true;
        } catch {}

        result.failedFiles.push({
          name: file.name,
          source: file.path,
          target: targetFilePath,
          errorCode: moveResult.error.errorCode,
          reason: moveResult.error.userMessage,
          originalError: moveResult.error.originalError,
          suggestion: moveResult.error.suggestion,
          existsInSource,
        });
        await logger.error(`✗ 移动失败: ${file.name}`, {
          error: moveResult.error,
          existsInSource,
        });
      }
    }

    // 处理无效数据
    const invalidMoves = (scheme.plannedMoves || []).filter(m => !m || !m.file || !m.file.path);
    for (const invalid of invalidMoves) {
      stats.skipped++;
      const skipInfo = {
        name: invalid?.file?.name || '未知',
        reason: '文件信息不完整（缺少路径）',
        invalidData: true,
      };
      result.skippedFiles.push(skipInfo);
      await logger.warn('跳过无效数据', skipInfo);
    }

    // ========== 阶段3: 统计校验 ==========
    await logger.info('---------- 阶段3: 统计校验 ----------');
    
    const report = generateExecutionReport(stats);
    result.stats.consistency = report.consistency;
    
    await logger.info('执行统计', {
      扫描总数: stats.scanned,
      计划处理: stats.planned,
      实际尝试: stats.attempted,
      成功: stats.succeeded,
      失败: stats.failed,
      跳过: stats.skipped,
      一致性: report.consistency.totalMatches ? '通过' : `差异 ${report.consistency.discrepancy}`,
    });

    if (!report.consistency.totalMatches) {
      await logger.warn('统计不一致', report.consistency);
    }

    // 任务完成
    result.status = 'completed';
    result.finishedAt = new Date().toISOString();
    result.logs = logger.getLogs();

    await logger.info('========== 任务完成 ==========', {
      status: result.status,
      duration: new Date(result.finishedAt) - new Date(result.startedAt),
    });

    await saveTask(result);

    return {
      success: true,
      result,
    };

  } catch (error) {
    const errorInfo = classifyError(error, 'unknown');
    await logger.error('任务执行异常', errorInfo);

    result.status = 'failed';
    result.finishedAt = new Date().toISOString();
    result.error = errorInfo.userMessage;
    result.errorDetails = errorInfo;
    result.logs = logger.getLogs();

    await saveTask(result);

    return {
      success: false,
      error: errorInfo.userMessage,
      errorDetails: errorInfo,
      result,
    };
  }
}

/**
 * 保存任务
 */
async function saveTask(task) {
  try {
    const taskFile = path.join(TASKS_DIR, `${task.taskId}.json`);
    await fs.writeFile(taskFile, JSON.stringify(task, null, 2));
    
    const latestFile = path.join(TASKS_DIR, 'latest.json');
    await fs.writeFile(latestFile, JSON.stringify(task, null, 2));
  } catch (e) {
    console.error('保存任务失败:', e);
  }
}

/**
 * 获取最近任务
 */
async function getLatestTask() {
  try {
    const data = await fs.readFile(path.join(TASKS_DIR, 'latest.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 获取任务历史
 */
async function getTaskHistory() {
  try {
    const files = await fs.readdir(TASKS_DIR);
    const tasks = [];
    for (const file of files) {
      if (file.endsWith('.json') && file !== 'latest.json') {
        try {
          const data = await fs.readFile(path.join(TASKS_DIR, file), 'utf-8');
          tasks.push(JSON.parse(data));
        } catch {}
      }
    }
    return tasks.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  } catch {
    return [];
  }
}

/**
 * 撤销任务
 */
async function rollbackLatestTask() {
  const task = await getLatestTask();
  
  if (!task) {
    return { success: false, error: '没有找到可撤销的任务' };
  }
  
  if (task.status !== 'completed') {
    return { success: false, error: '只有已完成的任务才能撤销' };
  }

  const logger = new OperationLogger(`${task.taskId}-rollback`);
  await logger.info('开始撤销任务', { taskId: task.taskId });

  const rollbackResult = {
    taskId: task.taskId,
    successFiles: [],
    failedFiles: [],
    rolledbackAt: new Date().toISOString(),
    logs: [],
  };

  for (const move of task.movedFiles || []) {
    try {
      await logger.info(`撤销: ${move.target} -> ${move.source}`);
      
      // 检查文件是否在目标位置
      try {
        await fs.access(move.target);
      } catch {
        const reason = '文件已不在目标位置';
        await logger.warn(`撤销跳过: ${move.name}`, { reason });
        rollbackResult.failedFiles.push({ name: move.name, reason });
        continue;
      }

      // 检查原位置
      let finalSource = move.source;
      try {
        await fs.access(move.source);
        // 有冲突，使用新名称
        const dir = path.dirname(move.source);
        const ext = path.extname(move.source);
        const base = path.basename(move.source, ext);
        let counter = 1;
        while (true) {
          try {
            await fs.access(finalSource);
            finalSource = path.join(dir, `${base} (恢复 ${counter})${ext}`);
            counter++;
          } catch {
            break;
          }
        }
      } catch {
        // 原位置为空，可以直接移回
      }

      await fs.rename(move.target, finalSource);
      rollbackResult.successFiles.push({
        name: move.name,
        from: move.target,
        to: finalSource,
      });
      await logger.info(`撤销成功: ${move.name}`);
      
    } catch (e) {
      const errorInfo = classifyError(e, 'move', move.target, move.source);
      await logger.error(`撤销失败: ${move.name}`, errorInfo);
      rollbackResult.failedFiles.push({
        name: move.name,
        reason: errorInfo.userMessage,
      });
    }
  }

  rollbackResult.logs = logger.getLogs();
  task.rolledback = true;
  task.rollbackResult = rollbackResult;
  await saveTask(task);

  const allSuccess = rollbackResult.failedFiles.length === 0;
  return {
    success: allSuccess,
    partial: !allSuccess && rollbackResult.successFiles.length > 0,
    result: rollbackResult,
    message: allSuccess
      ? '撤销成功'
      : `撤销部分成功：${rollbackResult.successFiles.length} 个文件恢复，${rollbackResult.failedFiles.length} 个文件失败`,
  };
}

module.exports = {
  executeTask,
  getLatestTask,
  getTaskHistory,
  rollbackLatestTask,
};
