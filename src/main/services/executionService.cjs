/**
 * 执行服务 - 处理真实的文件操作
 * 增强版：详细日志、失败分类、跨卷移动支持
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// 任务存储目录
const TASKS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'tasks');
const LOGS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'logs');

/**
 * 日志记录器类
 */
class OperationLogger {
  constructor(taskId) {
    this.taskId = taskId;
    this.logs = [];
    this.logFile = path.join(LOGS_DIR, `${taskId}.log`);
  }

  /**
   * 记录日志
   * @param {string} level - 日志级别: INFO, WARN, ERROR
   * @param {string} message - 日志消息
   * @param {Object} details - 详细信息
   */
  async log(level, message, details = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      details,
    };
    this.logs.push(logEntry);

    // 控制台输出
    const consoleMessage = `[${timestamp}] [${level}] ${message}`;
    if (level === 'ERROR') {
      console.error(consoleMessage, details || '');
    } else if (level === 'WARN') {
      console.warn(consoleMessage, details || '');
    } else {
      console.log(consoleMessage, details || '');
    }

    // 写入日志文件
    await this.writeToFile(logEntry);
  }

  /**
   * 记录信息日志
   */
  async info(message, details = null) {
    await this.log('INFO', message, details);
  }

  /**
   * 记录警告日志
   */
  async warn(message, details = null) {
    await this.log('WARN', message, details);
  }

  /**
   * 记录错误日志
   */
  async error(message, details = null) {
    await this.log('ERROR', message, details);
  }

  /**
   * 写入日志文件
   */
  async writeToFile(logEntry) {
    try {
      await fs.mkdir(LOGS_DIR, { recursive: true });
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.logFile, logLine, 'utf-8');
    } catch (e) {
      console.error('写入日志文件失败:', e);
    }
  }

  /**
   * 获取所有日志
   */
  getLogs() {
    return this.logs;
  }
}

/**
 * 错误码映射：将系统错误码映射为 FailedFileErrorCode
 */
const errorCodeMapping = {
  EEXIST: 'DUPLICATE_NAME',
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  ENOENT: 'SOURCE_NOT_FOUND',
  EBUSY: 'FILE_LOCKED',
  EXDEV: 'CROSS_VOLUME_MOVE',
  ENOSPC: 'TARGET_DIR_CREATE_FAILED',
  ENOTEMPTY: 'TARGET_DIR_CREATE_FAILED',
  EISDIR: 'INVALID_PATH_CHARS',
  ENOTDIR: 'INVALID_PATH_CHARS',
  EINVAL: 'INVALID_PATH_CHARS',
};

/**
 * 建议操作映射
 */
const suggestionMapping = {
  DUPLICATE_NAME: '目标位置已存在同名文件，已自动重命名，如仍失败请手动处理',
  PERMISSION_DENIED: '请检查文件/文件夹权限，或以管理员身份运行应用',
  SOURCE_NOT_FOUND: '源文件可能已被删除或移动，请检查文件是否存在',
  FILE_LOCKED: '文件正被其他程序使用，请关闭相关程序后重试',
  CROSS_VOLUME_MOVE: '源文件和目标位置位于不同磁盘，应用已尝试复制方式移动',
  INVALID_PATH_CHARS: '文件名包含非法字符或路径无效，请重命名文件后重试',
  TARGET_DIR_CREATE_FAILED: '无法创建目标文件夹，请检查路径权限和磁盘空间',
  UNKNOWN: '请检查错误详情，或尝试手动处理该文件',
};

/**
 * 错误分类器
 * @param {Error} error - 错误对象
 * @returns {Object} - 错误分类结果
 */
function classifyError(error) {
  const code = error.code;
  const systemCode = code || 'UNKNOWN';
  const errorCode = errorCodeMapping[systemCode] || 'UNKNOWN';
  let userMessage = '未知错误';

  switch (code) {
    case 'EEXIST':
      userMessage = '目标文件已存在（重名冲突）';
      break;
    case 'EACCES':
    case 'EPERM':
      userMessage = '权限不足，无法访问文件或目录';
      break;
    case 'ENOENT':
      userMessage = '源文件或目标路径不存在';
      break;
    case 'EBUSY':
      userMessage = '文件被其他程序占用';
      break;
    case 'EXDEV':
      userMessage = '跨卷移动需要复制操作';
      break;
    case 'ENOSPC':
      userMessage = '磁盘空间不足';
      break;
    case 'ENOTEMPTY':
      userMessage = '目录不为空';
      break;
    case 'EISDIR':
      userMessage = '目标是目录而非文件';
      break;
    case 'ENOTDIR':
      userMessage = '目标路径不是目录';
      break;
    case 'EINVAL':
      userMessage = '无效的参数或路径';
      break;
    default:
      userMessage = error.message || '未知错误';
  }

  return {
    code: systemCode,
    errorCode,
    category: errorCode,
    userMessage,
    originalError: error.message,
    suggestion: suggestionMapping[errorCode],
  };
}

/**
 * 确保目录存在
 */
async function ensureDirectories() {
  try {
    await fs.mkdir(TASKS_DIR, { recursive: true });
    await fs.mkdir(LOGS_DIR, { recursive: true });
  } catch (e) {
    console.error('创建目录失败:', e);
  }
}

/**
 * 安全地移动文件（支持跨卷）
 * @param {string} source - 源文件路径
 * @param {string} target - 目标文件路径
 * @param {OperationLogger} logger - 日志记录器
 * @returns {Promise<Object>} - 移动结果
 */
async function safeMoveFile(source, target, logger) {
  await logger.info(`准备移动: ${source} -> ${target}`);

  try {
    // 首先尝试直接重命名（同卷移动，最快）
    await fs.rename(source, target);
    await logger.info(`移动成功: ${source} -> ${target}`, { method: 'rename' });
    return { success: true, method: 'rename' };
  } catch (error) {
    const errorInfo = classifyError(error);

    // 如果是跨卷移动错误，使用复制+删除方式
    if (errorInfo.code === 'EXDEV') {
      await logger.warn(`检测到跨卷移动，改用 copy+unlink 方式: ${source}`);
      return await crossDeviceMove(source, target, logger);
    }

    // 其他错误，记录并抛出
    await logger.error(`移动失败: ${source}`, {
      error: errorInfo,
      target,
    });
    throw error;
  }
}

/**
 * 跨卷移动文件（copy + unlink）
 * @param {string} source - 源文件路径
 * @param {string} target - 目标文件路径
 * @param {OperationLogger} logger - 日志记录器
 * @returns {Promise<Object>} - 移动结果
 */
async function crossDeviceMove(source, target, logger) {
  try {
    // 复制文件
    await logger.info(`开始复制文件: ${source} -> ${target}`);
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    await logger.info(`复制成功: ${source} -> ${target}`);

    // 删除源文件
    await logger.info(`删除源文件: ${source}`);
    await fs.unlink(source);
    await logger.info(`删除源文件成功: ${source}`);

    await logger.info(`跨卷移动成功: ${source} -> ${target}`, { method: 'copy+unlink' });
    return { success: true, method: 'copy+unlink' };
  } catch (error) {
    const errorInfo = classifyError(error);
    await logger.error(`跨卷移动失败: ${source}`, {
      error: errorInfo,
      target,
    });

    // 如果复制成功但删除失败，记录警告
    try {
      await fs.access(target);
      await logger.warn(`文件已复制到目标位置，但删除源文件失败: ${source}`);
    } catch {
      // 目标文件也不存在，复制就失败了
    }

    throw error;
  }
}

/**
 * 生成唯一的文件名（处理重名冲突）
 * @param {string} targetPath - 目标目录
 * @param {string} fileName - 原始文件名
 * @param {OperationLogger} logger - 日志记录器
 * @returns {Promise<string>} - 可用的目标路径
 */
async function generateUniqueFilePath(targetPath, fileName, logger) {
  let finalTargetPath = path.join(targetPath, fileName);
  let counter = 1;
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  while (true) {
    try {
      await fs.access(finalTargetPath);
      // 文件存在，添加序号
      const newName = `${baseName} (${counter})${ext}`;
      finalTargetPath = path.join(targetPath, newName);
      await logger.info(`检测到重名文件，生成新文件名: ${newName}`, {
        originalName: fileName,
        counter,
      });
      counter++;
    } catch {
      // 文件不存在，可以使用这个路径
      break;
    }
  }

  return finalTargetPath;
}

/**
 * 执行整理任务
 * @param {Object} taskPayload - 任务数据
 * @returns {Promise<Object>}
 */
async function executeTask(taskPayload) {
  await ensureDirectories();

  const { taskId, targetPath, scheme } = taskPayload;

  // 创建日志记录器
  const logger = new OperationLogger(taskId);
  await logger.info('任务开始执行', {
    taskId,
    targetPath,
    schemeId: scheme.schemeId,
    folderCount: scheme.suggestedFolders?.length || 0,
    moveCount: scheme.plannedMoves?.length || 0,
  });

  const result = {
    taskId,
    targetPath,
    schemeId: scheme.schemeId,
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
    // 1. 创建目标文件夹
    await logger.info('开始创建文件夹', {
      folders: scheme.suggestedFolders,
    });

    for (const folderName of scheme.suggestedFolders) {
      try {
        const folderPath = path.join(targetPath, folderName);
        await logger.info(`准备创建文件夹: ${folderPath}`);
        await fs.mkdir(folderPath, { recursive: true });
        result.createdFolders.push(folderPath);
        await logger.info(`文件夹创建成功: ${folderPath}`);
      } catch (e) {
        const errorInfo = classifyError(e);
        await logger.error(`创建文件夹失败: ${folderName}`, errorInfo);
        result.failedFiles.push({
          source: folderName,
          target: path.join(targetPath, folderName),
          reason: `创建文件夹失败: ${errorInfo.userMessage}`,
          errorCode: errorInfo.errorCode,
          suggestion: errorInfo.suggestion,
          existsInSource: false,
        });
      }
    }

    await logger.info('文件夹创建阶段完成', {
      successCount: result.createdFolders.length,
      failedCount: result.failedFiles.filter((f) => f.errorCode === 'TARGET_DIR_CREATE_FAILED').length,
    });

    // 2. 移动文件
    await logger.info('开始移动文件', {
      totalFiles: scheme.plannedMoves?.length || 0,
    });

    for (const move of scheme.plannedMoves) {
      const { file, targetFolder } = move;

      // 跳过已被排除的文件
      if (!file || !file.path) {
        const skipReason = '文件信息不完整';
        await logger.warn(`跳过文件: ${file?.name || '未知'}`, { reason: skipReason });
        result.skippedFiles.push({
          name: file?.name || '未知',
          reason: skipReason,
        });
        continue;
      }

      const targetFolderPath = path.join(targetPath, targetFolder);
      const targetPathFull = path.join(targetFolderPath, file.name);

      try {
        // 检查源文件是否存在
        await logger.info(`检查源文件是否存在: ${file.path}`);
        try {
          await fs.access(file.path);
        } catch (accessError) {
          const errorInfo = classifyError(accessError);
          await logger.error(`源文件不存在或无法访问: ${file.path}`, errorInfo);
          result.skippedFiles.push({
            name: file.name,
            source: file.path,
            reason: `源文件不存在: ${errorInfo.userMessage}`,
          });
          continue;
        }

        // 生成唯一的目标路径（处理重名）
        const finalTargetPath = await generateUniqueFilePath(
          targetFolderPath,
          file.name,
          logger
        );

        // 执行移动（支持跨卷）
        const moveResult = await safeMoveFile(file.path, finalTargetPath, logger);

        result.movedFiles.push({
          source: file.path,
          target: finalTargetPath,
          originalName: file.name,
          method: moveResult.method,
        });
      } catch (e) {
        const errorInfo = classifyError(e);
        await logger.error(`移动文件失败: ${file.name}`, {
          source: file.path,
          target: targetPathFull,
          error: errorInfo,
        });

        // 检查文件是否仍存在于原位置
        let existsInSource = false;
        try {
          await fs.access(file.path);
          existsInSource = true;
        } catch {
          existsInSource = false;
        }

        result.failedFiles.push({
          source: file.path,
          target: targetPathFull,
          reason: errorInfo.userMessage,
          errorCode: errorInfo.errorCode,
          suggestion: errorInfo.suggestion,
          existsInSource,
        });
      }
    }

    await logger.info('文件移动阶段完成', {
      successCount: result.movedFiles.length,
      skippedCount: result.skippedFiles.length,
      failedCount: result.failedFiles.length,
    });

    result.status = 'completed';
    result.finishedAt = new Date().toISOString();
    result.logs = logger.getLogs();

    await logger.info('任务执行完成', {
      status: result.status,
      createdFolders: result.createdFolders.length,
      movedFiles: result.movedFiles.length,
      skippedFiles: result.skippedFiles.length,
      failedFiles: result.failedFiles.length,
    });

    // 保存任务记录
    await saveTask(result);

    return {
      success: true,
      result,
    };
  } catch (error) {
    const errorInfo = classifyError(error);
    await logger.error('任务执行失败', {
      error: errorInfo,
      stack: error.stack,
    });

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
 * 保存任务记录
 * @param {Object} task - 任务数据
 */
async function saveTask(task) {
  try {
    const taskFile = path.join(TASKS_DIR, `${task.taskId}.json`);
    await fs.writeFile(taskFile, JSON.stringify(task, null, 2));

    // 同时保存为"最近任务"
    const latestFile = path.join(TASKS_DIR, 'latest.json');
    await fs.writeFile(latestFile, JSON.stringify(task, null, 2));
  } catch (e) {
    console.error('保存任务记录失败:', e);
  }
}

/**
 * 获取最近任务
 * @returns {Promise<Object|null>}
 */
async function getLatestTask() {
  try {
    const latestFile = path.join(TASKS_DIR, 'latest.json');
    const data = await fs.readFile(latestFile, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
}

/**
 * 获取所有任务历史
 * @returns {Promise<Array>}
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
        } catch (e) {}
      }
    }

    return tasks.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  } catch (e) {
    return [];
  }
}

/**
 * 撤销最近任务
 * @returns {Promise<Object>}
 */
async function rollbackLatestTask() {
  const task = await getLatestTask();

  if (!task) {
    return {
      success: false,
      error: '没有找到可撤销的任务',
    };
  }

  if (task.status !== 'completed') {
    return {
      success: false,
      error: '只有已完成的任务才能撤销',
    };
  }

  // 创建日志记录器
  const logger = new OperationLogger(`${task.taskId}-rollback`);
  await logger.info('开始撤销任务', { taskId: task.taskId });

  const rollbackResult = {
    taskId: task.taskId,
    successFiles: [],
    failedFiles: [],
    rolledbackAt: new Date().toISOString(),
    logs: [],
  };

  // 反向移动文件（从新位置移回旧位置）
  for (const move of task.movedFiles) {
    try {
      await logger.info(`准备撤销移动: ${move.target} -> ${move.source}`);

      // 检查文件是否还在目标位置
      try {
        await fs.access(move.target);
      } catch {
        // 文件已不存在，可能已被手动移动或删除
        const reason = '文件已不在目标位置';
        await logger.warn(`撤销跳过: ${move.originalName}`, { reason });
        rollbackResult.failedFiles.push({
          name: move.originalName,
          source: move.target,
          target: move.source,
          reason: reason,
        });
        continue;
      }

      // 检查原位置是否已有文件
      let finalSource = move.source;
      try {
        await fs.access(move.source);
        // 原位置有文件，需要重命名
        const dir = path.dirname(move.source);
        const ext = path.extname(move.source);
        const baseName = path.basename(move.source, ext);
        let counter = 1;

        while (true) {
          try {
            await fs.access(finalSource);
            finalSource = path.join(dir, `${baseName} (恢复 ${counter})${ext}`);
            counter++;
          } catch {
            break;
          }
        }

        await logger.info(`原位置有冲突，使用新名称: ${finalSource}`);

        // 使用安全移动（支持跨卷回滚）
        await safeMoveFile(move.target, finalSource, logger);

        rollbackResult.successFiles.push({
          name: move.originalName,
          from: move.target,
          to: finalSource,
          note: '原位置有冲突文件，已添加"恢复"标记',
          method: 'rename-with-suffix',
        });
      } catch {
        // 原位置没有文件，可以直接移回
        await safeMoveFile(move.target, finalSource, logger);

        rollbackResult.successFiles.push({
          name: move.originalName,
          from: move.target,
          to: finalSource,
          method: 'rename',
        });
      }
    } catch (e) {
      const errorInfo = classifyError(e);
      await logger.error(`撤销移动失败: ${move.originalName}`, {
        source: move.target,
        target: move.source,
        error: errorInfo,
      });

      rollbackResult.failedFiles.push({
        name: move.originalName,
        source: move.target,
        target: move.source,
        reason: errorInfo.userMessage,
        errorCode: errorInfo.code,
        errorCategory: errorInfo.category,
      });
    }
  }

  rollbackResult.logs = logger.getLogs();

  // 更新任务状态为已撤销
  task.rolledback = true;
  task.rollbackResult = rollbackResult;
  task.rolledbackAt = rollbackResult.rolledbackAt;
  await saveTask(task);

  await logger.info('撤销任务完成', {
    successCount: rollbackResult.successFiles.length,
    failedCount: rollbackResult.failedFiles.length,
  });

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
  saveTask,
  // 导出测试用
  classifyError,
  OperationLogger,
};
