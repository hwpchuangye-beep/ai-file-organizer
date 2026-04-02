/**
 * 执行服务 - 处理真实的文件操作
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// 任务存储目录
const TASKS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'tasks');

/**
 * 确保任务目录存在
 */
async function ensureTasksDir() {
  try {
    await fs.mkdir(TASKS_DIR, { recursive: true });
  } catch (e) {
    console.error('创建任务目录失败:', e);
  }
}

/**
 * 执行整理任务
 * @param {Object} taskPayload - 任务数据
 * @returns {Promise<Object>}
 */
async function executeTask(taskPayload) {
  await ensureTasksDir();
  
  const {
    taskId,
    targetPath,
    scheme,
  } = taskPayload;

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
  };

  try {
    // 1. 创建目标文件夹
    for (const folderName of scheme.suggestedFolders) {
      try {
        const folderPath = path.join(targetPath, folderName);
        await fs.mkdir(folderPath, { recursive: true });
        result.createdFolders.push(folderPath);
      } catch (e) {
        console.error(`创建文件夹失败: ${folderName}`, e);
        result.failedFiles.push({
          type: 'create_folder',
          name: folderName,
          error: e.message,
        });
      }
    }

    // 2. 移动文件
    for (const move of scheme.plannedMoves) {
      const { file, targetFolder } = move;
      
      // 跳过已被排除的文件
      if (!file || !file.path) {
        result.skippedFiles.push({
          name: file?.name || '未知',
          reason: '文件信息不完整',
        });
        continue;
      }

      const targetPath_full = path.join(targetPath, targetFolder, file.name);
      
      try {
        // 检查源文件是否存在
        await fs.access(file.path);
        
        // 检查目标是否已存在同名文件
        let finalTargetPath = targetPath_full;
        let counter = 1;
        const ext = path.extname(file.name);
        const baseName = path.basename(file.name, ext);
        
        while (true) {
          try {
            await fs.access(finalTargetPath);
            // 文件存在，添加序号
            finalTargetPath = path.join(
              targetPath, 
              targetFolder, 
              `${baseName} (${counter})${ext}`
            );
            counter++;
          } catch {
            // 文件不存在，可以使用这个路径
            break;
          }
        }

        // 执行移动
        await fs.rename(file.path, finalTargetPath);
        
        result.movedFiles.push({
          source: file.path,
          target: finalTargetPath,
          originalName: file.name,
        });
      } catch (e) {
        result.failedFiles.push({
          name: file.name,
          source: file.path,
          target: targetPath_full,
          error: e.message,
        });
      }
    }

    result.status = 'completed';
    result.finishedAt = new Date().toISOString();

    // 保存任务记录
    await saveTask(result);

    return {
      success: true,
      result,
    };
  } catch (error) {
    result.status = 'failed';
    result.finishedAt = new Date().toISOString();
    result.error = error.message;
    
    await saveTask(result);
    
    return {
      success: false,
      error: error.message,
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
    
    return tasks.sort((a, b) => 
      new Date(b.startedAt) - new Date(a.startedAt)
    );
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

  const rollbackResult = {
    taskId: task.taskId,
    successFiles: [],
    failedFiles: [],
    rolledbackAt: new Date().toISOString(),
  };

  // 反向移动文件（从新位置移回旧位置）
  for (const move of task.movedFiles) {
    try {
      // 检查文件是否还在目标位置
      try {
        await fs.access(move.target);
      } catch {
        // 文件已不存在，可能已被手动移动或删除
        rollbackResult.failedFiles.push({
          name: move.originalName,
          source: move.target,
          target: move.source,
          reason: '文件已不在目标位置',
        });
        continue;
      }

      // 检查原位置是否已有文件
      try {
        await fs.access(move.source);
        // 原位置有文件，需要重命名
        const dir = path.dirname(move.source);
        const ext = path.extname(move.source);
        const baseName = path.basename(move.source, ext);
        let finalSource = move.source;
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
        
        await fs.rename(move.target, finalSource);
        rollbackResult.successFiles.push({
          name: move.originalName,
          from: move.target,
          to: finalSource,
          note: '原位置有冲突文件，已添加"恢复"标记',
        });
      } catch {
        // 原位置没有文件，可以直接移回
        await fs.rename(move.target, move.source);
        rollbackResult.successFiles.push({
          name: move.originalName,
          from: move.target,
          to: move.source,
        });
      }
    } catch (e) {
      rollbackResult.failedFiles.push({
        name: move.originalName,
        source: move.target,
        target: move.source,
        reason: e.message,
      });
    }
  }

  // 更新任务状态为已撤销
  task.rolledback = true;
  task.rollbackResult = rollbackResult;
  task.rolledbackAt = rollbackResult.rolledbackAt;
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
  saveTask,
};
