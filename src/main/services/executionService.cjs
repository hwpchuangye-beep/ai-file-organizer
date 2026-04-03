/**
 * 执行服务 - 处理真实的文件操作
 * 核心修复版：精确错误分类、子目录正确处理、统计一致性
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const schemaValidator = require('./schemaValidatorService.cjs');
const taskService = require('./taskService.cjs');

// 任务存储目录
const TASKS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'tasks');
const LOGS_DIR = path.join(os.homedir(), '.ai-file-organizer', 'logs');

/**
 * ========== 项目保护模式配置 ==========
 * 
 * 检测到以下标记的目录将被视为项目/工作区，整体保护不拆分内部文件
 */

// 版本控制标记 - 代码仓库根
const VCS_MARKERS = ['.git', '.svn', '.hg', '.bzr'];

// 项目根标记 - 项目配置文件
const PROJECT_ROOT_MARKERS = [
  // JavaScript/Node
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.npmrc',
  // Python
  'requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'poetry.lock',
  // Java
  'pom.xml', 'build.gradle', 'gradle.properties',
  // Go
  'go.mod', 'go.sum',
  // Rust
  'Cargo.toml', 'Cargo.lock',
  // Ruby
  'Gemfile', 'Gemfile.lock',
  // PHP
  'composer.json', 'composer.lock',
  // .NET
  '*.csproj', '*.sln', 'packages.config',
  // C/C++
  'Makefile', 'CMakeLists.txt', 'configure.ac', 'configure.in',
  // Swift/iOS
  'Package.swift', '*.xcodeproj', '*.xcworkspace',
  // Android
  'build.gradle.kts', 'settings.gradle', 'AndroidManifest.xml',
  // Docker
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  // CI/CD
  '.github', '.gitlab-ci.yml', 'Jenkinsfile', '.travis.yml', '.circleci',
  // Generic
  'README.md', 'LICENSE', 'LICENSE.txt', 'LICENSE.md',
  '.gitignore', '.gitattributes',
  // IDE/Editor
  '.editorconfig', '.prettierrc', '.eslintrc', '.babelrc',
];

// 工作区标记 - IDE/编辑器配置
const WORKSPACE_MARKERS = [
  '.vscode',           // VS Code
  '.idea',             // JetBrains
  '.vs',               // Visual Studio
  '.eclipse',          // Eclipse
  '.settings',         // Eclipse
  '.project',          // Eclipse
  '.classpath',        // Eclipse
  'nbproject',         // NetBeans
  '.theia',            // Theia
  '.devcontainer',     // VS Code Dev Container
];

// 特殊目录 - 不应被整理的项目目录
const PROTECTED_DIR_NAMES = [
  'node_modules',
  'vendor',
  'target',
  'build',
  'dist',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.gradle',
  '.m2',
  'bin',
  'obj',
  'Debug',
  'Release',
  'x64',
  'x86',
  '.vs',
  '.terraform',
  '.serverless',
];

/**
 * 检测目录是否为项目根目录
 * @param {string} dirPath - 目录路径
 * @returns {Promise<Object>} - 检测结果
 */
async function detectProjectRoot(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const entryNames = entries.map(e => e.name);
    
    let detectedMarkers = [];
    let projectType = null;
    let confidence = 0;
    
    // 检查版本控制
    for (const marker of VCS_MARKERS) {
      if (entryNames.includes(marker)) {
        detectedMarkers.push({ type: 'vcs', name: marker });
        confidence += 0.5;
        if (marker === '.git') projectType = 'git-repository';
      }
    }
    
    // 检查项目根标记
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (marker.includes('*')) {
        // 通配符匹配
        const pattern = marker.replace(/\*/g, '');
        for (const name of entryNames) {
          if (name.endsWith(pattern)) {
            detectedMarkers.push({ type: 'project', name });
            confidence += 0.3;
            if (!projectType) {
              if (name.includes('package')) projectType = 'nodejs';
              else if (name.includes('Cargo')) projectType = 'rust';
              else if (name.includes('go.')) projectType = 'golang';
              else if (name.includes('pom') || name.includes('gradle')) projectType = 'java';
              else if (name.includes('requirements') || name.includes('pyproject')) projectType = 'python';
              else projectType = 'project';
            }
          }
        }
      } else if (entryNames.includes(marker)) {
        detectedMarkers.push({ type: 'project', name: marker });
        confidence += 0.3;
        if (!projectType) {
          if (marker === 'package.json') projectType = 'nodejs';
          else if (marker === 'Cargo.toml') projectType = 'rust';
          else if (marker === 'go.mod') projectType = 'golang';
          else if (marker === 'pom.xml' || marker === 'build.gradle') projectType = 'java';
          else if (marker === 'requirements.txt' || marker === 'pyproject.toml') projectType = 'python';
          else projectType = 'project';
        }
      }
    }
    
    // 检查工作区标记
    for (const marker of WORKSPACE_MARKERS) {
      if (entryNames.includes(marker)) {
        detectedMarkers.push({ type: 'workspace', name: marker });
        confidence += 0.2;
      }
    }
    
    const isProjectRoot = confidence >= 0.3;
    
    return {
      isProjectRoot,
      projectType: isProjectRoot ? (projectType || 'generic-project') : null,
      confidence: Math.min(confidence, 1.0),
      markers: detectedMarkers,
      shouldProtect: isProjectRoot || entryNames.some(name => PROTECTED_DIR_NAMES.includes(name)),
    };
  } catch (e) {
    return { isProjectRoot: false, shouldProtect: false, error: e.message };
  }
}

/**
 * 扫描目录并标记项目
 * @param {string} targetPath - 目标路径
 * @returns {Promise<Object>} - 扫描结果
 */
async function scanWithProjectProtection(targetPath) {
  const files = [];              // 可整理的普通文件
  const protectedProjects = [];  // 受保护的项目列表
  let protectedFileCount = 0;    // 受保护的文件总数
  
  // 使用栈来避免递归深度问题，同时跟踪是否在保护项目内
  const stack = [{ path: targetPath, relativePath: '', depth: 0, isProtected: false, projectInfo: null }];
  
  while (stack.length > 0) {
    const { path: currentPath, relativePath, depth, isProtected, projectInfo: parentProject } = stack.pop();
    
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    
    // 检测当前目录是否为项目根（只要不是根目录，或者根目录本身也是项目）
    const projectInfo = await detectProjectRoot(currentPath);
    const isProjectRoot = projectInfo.shouldProtect;
    const dirName = path.basename(currentPath);
    const isProtectedDirName = PROTECTED_DIR_NAMES.includes(dirName);
    
    // 如果当前目录是项目根或受保护目录名，标记为保护
    if ((isProjectRoot || isProtectedDirName) && !isProtected) {
      const currentProjectInfo = isProjectRoot ? {
        path: currentPath,
        relativePath: relativePath,
        type: projectInfo.projectType || 'protected-directory',
        markers: projectInfo.markers.map(m => m.name),
        confidence: projectInfo.confidence,
      } : {
        path: currentPath,
        relativePath: relativePath,
        type: 'protected-directory',
        markers: [dirName],
        confidence: 1.0,
      };
      
      protectedProjects.push(currentProjectInfo);
      
      // 统计该项目内的所有文件（但不添加到可整理列表）
      const count = await countFilesRecursive(currentPath);
      protectedFileCount += count;
      
      // 继续扫描子目录，但标记为受保护状态
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(currentPath, entry.name);
        const relPath = path.join(relativePath, entry.name);
        
        if (entry.isDirectory()) {
          stack.push({ 
            path: fullPath, 
            relativePath: relPath, 
            depth: depth + 1, 
            isProtected: true,
            projectInfo: currentProjectInfo
          });
        } else if (entry.isFile()) {
          // 受保护的文件只计数，不加入可整理列表
          protectedFileCount++;
        }
      }
      continue;
    }
    
    // 如果在受保护的项目内，只计数不收集
    if (isProtected) {
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(currentPath, entry.name);
        
        if (entry.isDirectory()) {
          stack.push({ 
            path: fullPath, 
            relativePath: path.join(relativePath, entry.name), 
            depth: depth + 1, 
            isProtected: true,
            projectInfo: parentProject
          });
        } else if (entry.isFile()) {
          protectedFileCount++;
        }
      }
      continue;
    }
    
    // 普通目录，正常收集文件
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        stack.push({ 
          path: fullPath, 
          relativePath: relPath, 
          depth: depth + 1, 
          isProtected: false,
          projectInfo: null
        });
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(entry.name).toLowerCase(),
            isInProtectedProject: false,
          });
        } catch (e) {}
      }
    }
  }
  
  return {
    files,
    protectedProjects,
    protectedFileCount,
    totalFiles: files.length + protectedFileCount,
  };
}

/**
 * 递归计算目录中的文件数量
 */
async function countFilesRecursive(dirPath) {
  let fileCount = 0;
  
  async function doCount(currentPath) {
    let entries;
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(currentPath, entry.name);
      
      if (entry.isDirectory()) {
        await doCount(fullPath);
      } else if (entry.isFile()) {
        fileCount++;
      }
    }
  }
  
  await doCount(dirPath);
  return fileCount;
}

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
    let existedBefore = true;
    try {
      const preStat = await fs.stat(targetDir);
      if (!preStat.isDirectory()) {
        throw new Error('目标路径已存在且不是目录');
      }
    } catch (preErr) {
      if (preErr.code === 'ENOENT') {
        existedBefore = false;
      } else {
        throw preErr;
      }
    }

    await fs.mkdir(targetDir, { recursive: true });
    
    // 验证目录确实被创建
    const stats = await fs.stat(targetDir);
    if (!stats.isDirectory()) {
      throw new Error('创建的路径不是目录');
    }
    
    await logger.info(`目标目录就绪: ${targetDir}`);
    return { success: true, created: !existedBefore };
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

  // 2.5 同名冲突预检测（避免 rename 直接覆盖已有文件）
  if (await fileExists(targetPath)) {
    await logger.warn(`检测到目标已存在，改用唯一文件名: ${targetPath}`);
    return await moveWithUniqueName(sourcePath, targetPath, logger);
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

  const { taskId, targetPath, scheme, scannedTotal } = taskPayload;
  const logger = new OperationLogger(taskId);

  // 统计信息
  const stats = {
    scanned: scannedTotal || scheme.plannedMoves?.length || 0, // 扫描到的文件总数
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
    protectedProjects: scheme.protectedProjects || [], // 受保护的项目列表
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    logs: [],
  };
  
  // 记录项目保护模式状态
  if (result.protectedProjects.length > 0) {
    await logger.info('项目保护模式已启用', {
      protectedCount: result.protectedProjects.length,
      protectedTypes: result.protectedProjects.map(p => p.type),
      protectedPaths: result.protectedProjects.map(p => p.relativePath),
    });
  }

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
    
    // 更新统计信息，包含保护的项目
    result.stats.protectedProjects = result.protectedProjects.length;
    result.stats.protectedFiles = scheme.protectedFileCount || 0;

    await logger.info('========== 任务完成 ==========', {
      status: result.status,
      duration: new Date(result.finishedAt) - new Date(result.startedAt),
      protectedProjects: result.protectedProjects.length,
      protectedFiles: result.stats.protectedFiles,
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
 * 智能撤销任务
 * 
 * 业务语义判断逻辑：
 * 1. 已撤销状态：原位置存在，目标位置不存在 → 达成目标 ✅
 * 2. 自动达成：原位置存在，目标位置不存在（用户手动移回）→ 达成目标 ✅
 * 3. 冲突状态：两边都存在 → 智能判断处理 ⚠️
 * 4. 丢失状态：两边都不存在 → 失败 ❌
 * 5. 异常状态：原位置不存在，目标位置存在 → 执行撤销
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
  await logger.info('开始智能撤销任务', { taskId: task.taskId, totalFiles: task.movedFiles?.length || 0 });

  const rollbackResult = {
    taskId: task.taskId,
    successFiles: [],      // 成功撤销的文件
    alreadyRolledBack: [], // 已自动达成（用户手动移回）
    conflictFiles: [],     // 冲突需要处理的文件
    failedFiles: [],       // 真正失败的文件（丢失）
    skippedFiles: [],      // 跳过的文件
    rolledbackAt: new Date().toISOString(),
    logs: [],
  };

  for (const move of task.movedFiles || []) {
    try {
      await logger.info(`分析撤销状态: ${move.name}`, {
        source: move.source,
        target: move.target,
      });

      // 获取文件状态
      const sourceExists = await fileExists(move.source);
      const targetExists = await fileExists(move.target);

      // 情况1：已撤销或自动达成（原位置存在，目标位置不存在）
      if (sourceExists && !targetExists) {
        const isManualRecovery = !move.rolledBackAt; // 没有撤销记录说明是用户手动移回的
        const status = isManualRecovery ? 'auto_achieved' : 'already_rolled_back';
        
        rollbackResult.alreadyRolledBack.push({
          name: move.name,
          source: move.source,
          status: status,
          reason: isManualRecovery ? '文件已在原位置（可能用户手动移回）' : '已在此前撤销',
        });
        await logger.info(`撤销已达成（无需操作）: ${move.name}`, { status });
        continue;
      }

      // 情况2：两边都不存在 - 文件丢失
      if (!sourceExists && !targetExists) {
        rollbackResult.failedFiles.push({
          name: move.name,
          source: move.source,
          target: move.target,
          reason: '文件丢失：原位置和目标位置都找不到文件',
          severity: 'high',
        });
        await logger.error(`撤销失败（文件丢失）: ${move.name}`, {
          source: move.source,
          target: move.target,
        });
        continue;
      }

      // 情况3：目标位置存在，原位置不存在 - 执行撤销移动
      if (!sourceExists && targetExists) {
        // 检查原位置父目录是否存在
        const sourceDir = path.dirname(move.source);
        const dirExists = await fileExists(sourceDir);
        
        if (!dirExists) {
          try {
            await fs.mkdir(sourceDir, { recursive: true });
            await logger.info(`创建原目录: ${sourceDir}`);
          } catch (e) {
            rollbackResult.failedFiles.push({
              name: move.name,
              reason: `无法创建原目录: ${e.message}`,
              severity: 'medium',
            });
            continue;
          }
        }

        // 执行移动
        await fs.rename(move.target, move.source);
        rollbackResult.successFiles.push({
          name: move.name,
          from: move.target,
          to: move.source,
          method: 'rename',
        });
        await logger.info(`撤销成功: ${move.name}`);
        continue;
      }

      // 情况4：两边都存在 - 冲突，需要智能处理
      if (sourceExists && targetExists) {
        // 获取文件信息进行比较
        const sourceInfo = await getFileInfo(move.source);
        const targetInfo = await getFileInfo(move.target);

        // 智能判断策略
        const decision = await resolveConflict(move, sourceInfo, targetInfo);

        if (decision.action === 'keep_both') {
          // 保留两个版本，目标位置的文件重命名
          const dir = path.dirname(move.source);
          const ext = path.extname(move.name);
          const base = path.basename(move.name, ext);
          
          let finalSource = path.join(dir, `${base} (来自整理)${ext}`);
          let counter = 1;
          while (await fileExists(finalSource)) {
            finalSource = path.join(dir, `${base} (来自整理 ${counter})${ext}`);
            counter++;
          }

          await fs.rename(move.target, finalSource);
          rollbackResult.conflictFiles.push({
            name: move.name,
            action: 'renamed',
            sourceFile: move.source,
            targetFile: finalSource,
            reason: decision.reason,
          });
          await logger.info(`冲突解决（保留两份）: ${move.name} -> ${finalSource}`);

        } else if (decision.action === 'replace_source') {
          // 目标位置的文件较新，替换原位置的
          await fs.unlink(move.source);
          await fs.rename(move.target, move.source);
          rollbackResult.successFiles.push({
            name: move.name,
            from: move.target,
            to: move.source,
            method: 'replace',
            note: '用整理后的版本替换了原位置的版本',
          });
          await logger.info(`冲突解决（替换原文件）: ${move.name}`);

        } else if (decision.action === 'keep_source') {
          // 原位置的文件较新，删除目标位置的
          await fs.unlink(move.target);
          rollbackResult.alreadyRolledBack.push({
            name: move.name,
            source: move.source,
            status: 'conflict_resolved',
            reason: '原位置文件较新，删除了目标位置的副本',
          });
          await logger.info(`冲突解决（保留原文件）: ${move.name}`);

        } else {
          // 无法判断，记录冲突待用户处理
          rollbackResult.conflictFiles.push({
            name: move.name,
            action: 'manual_required',
            sourceFile: move.source,
            targetFile: move.target,
            sourceInfo,
            targetInfo,
            reason: '无法自动判断哪个版本更合适，请手动处理',
          });
          await logger.warn(`冲突待手动处理: ${move.name}`);
        }
      }
      
    } catch (e) {
      const errorInfo = classifyError(e, 'move', move.target, move.source);
      await logger.error(`撤销异常: ${move.name}`, errorInfo);
      rollbackResult.failedFiles.push({
        name: move.name,
        reason: errorInfo.userMessage,
        severity: 'medium',
      });
    }
  }

  // 计算总体结果
  const totalProcessed = rollbackResult.successFiles.length + 
                         rollbackResult.alreadyRolledBack.length +
                         rollbackResult.conflictFiles.length +
                         rollbackResult.failedFiles.length;
  
  const trulyFailed = rollbackResult.failedFiles.filter(f => f.severity === 'high').length;
  const hasConflicts = rollbackResult.conflictFiles.length > 0;

  rollbackResult.logs = logger.getLogs();
  task.rolledback = true;
  task.rollbackResult = rollbackResult;
  await saveTask(task);

  // 生成用户友好的消息
  let message = '';
  if (trulyFailed === 0 && !hasConflicts) {
    message = `撤销完成：${rollbackResult.successFiles.length} 个文件已恢复，${rollbackResult.alreadyRolledBack.length} 个文件状态正常`;
  } else if (trulyFailed === 0 && hasConflicts) {
    message = `撤销完成：${rollbackResult.successFiles.length} 个文件已恢复，${rollbackResult.conflictFiles.length} 个文件存在冲突需要检查`;
  } else {
    message = `撤销部分完成：${rollbackResult.successFiles.length} 个成功，${rollbackResult.alreadyRolledBack.length} 个状态正常，${rollbackResult.conflictFiles.length} 个冲突，${trulyFailed} 个文件丢失`;
  }

  return {
    success: trulyFailed === 0,
    partial: trulyFailed > 0 && rollbackResult.successFiles.length > 0,
    hasConflicts,
    result: rollbackResult,
    message,
  };
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取文件信息
 */
async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      exists: true,
      size: stats.size,
      modifiedAt: stats.mtime,
      createdAt: stats.birthtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    };
  } catch {
    return { exists: false };
  }
}

/**
 * 智能冲突解决
 * 根据文件大小、修改时间判断哪个版本更合适
 */
async function resolveConflict(move, sourceInfo, targetInfo) {
  // 策略1：如果文件大小差异很大，保留较大的（可能包含更多信息）
  const sizeDiff = Math.abs(sourceInfo.size - targetInfo.size);
  const sizeDiffPercent = sizeDiff / Math.max(sourceInfo.size, targetInfo.size);
  
  if (sizeDiffPercent > 0.5) {
    // 大小差异超过50%
    if (targetInfo.size > sourceInfo.size) {
      return {
        action: 'replace_source',
        reason: '目标位置的文件明显更大，可能包含更多内容',
      };
    } else {
      return {
        action: 'keep_source',
        reason: '原位置的文件更大，保留原文件',
      };
    }
  }

  // 策略2：根据修改时间判断
  const timeDiff = targetInfo.modifiedAt.getTime() - sourceInfo.modifiedAt.getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  
  if (hoursDiff > 24) {
    // 目标位置的文件比原位置的晚超过24小时
    return {
      action: 'replace_source',
      reason: '目标位置的文件更新（修改时间晚24小时以上）',
    };
  } else if (hoursDiff < -24) {
    // 原位置的文件更新
    return {
      action: 'keep_source',
      reason: '原位置的文件更新',
    };
  }

  // 策略3：默认保留两份
  return {
    action: 'keep_both',
    reason: '两个版本差异不大，建议都保留',
  };
}

// ========== 历史隐藏目录检测与修复 ==========

// 隐藏目录名到可见目录名的映射
const HIDDEN_DIR_MAPPING = {
  '.xlsx': 'Excel表格',
  '.xls': 'Excel表格',
  '.csv': 'CSV数据',
  '.docx': 'Word文档',
  '.doc': 'Word文档',
  '.pdf': 'PDF文档',
  '.txt': '文本文件',
  '.ppt': 'PPT演示',
  '.pptx': 'PPT演示',
  '.key': 'Keynote演示',
  '.xmind': 'XMind脑图',
  '.mindnode': 'MindNode脑图',
  '.png': 'PNG图片',
  '.jpg': 'JPG图片',
  '.jpeg': 'JPG图片',
  '.gif': 'GIF动图',
  '.webp': 'WebP图片',
  '.zip': 'ZIP压缩包',
  '.rar': 'RAR压缩包',
  '.7z': '7Z压缩包',
  '.dmg': 'DMG安装包',
  '.pkg': 'PKG安装包',
  '.apk': 'APK安装包',
  '.mp3': 'MP3音频',
  '.mp4': 'MP4视频',
  '.mov': 'MOV视频',
};

// 检测隐藏目录
async function detectHiddenDirectories(targetPath) {
  const hiddenDirs = [];
  
  try {
    const entries = await fs.readdir(targetPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('.') && entry.name.length > 1) {
        // 排除标准系统目录如 .DS_Store
        if (entry.name === '.DS_Store' || entry.name === '.localized') continue;
        
        const dirPath = path.join(targetPath, entry.name);
        const files = await countFilesInDir(dirPath);
        
        // 检查是否是已知的隐藏分类目录
        const cleanName = entry.name.toLowerCase();
        if (HIDDEN_DIR_MAPPING[cleanName] || HIDDEN_DIR_MAPPING[cleanName.substring(1)]) {
          hiddenDirs.push({
            name: entry.name,
            path: dirPath,
            proposedName: HIDDEN_DIR_MAPPING[cleanName] || HIDDEN_DIR_MAPPING[cleanName.substring(1)] || '其他',
            fileCount: files,
          });
        }
      }
    }
  } catch (e) {
    console.error('检测隐藏目录失败:', e);
  }
  
  return hiddenDirs;
}

// 统计目录中的文件数
async function countFilesInDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isFile()) count++;
      else if (entry.isDirectory()) {
        count += await countFilesInDir(path.join(dirPath, entry.name));
      }
    }
    return count;
  } catch (e) {
    return 0;
  }
}

// 生成修复预览
async function generateRepairPreview(hiddenDirs, targetPath) {
  const preview = [];
  
  for (const dir of hiddenDirs) {
    let finalName = dir.proposedName;
    let conflict = false;
    let conflictResolvedName = null;
    
    // 检查目标目录是否已存在
    const targetDir = path.join(targetPath, finalName);
    try {
      await fs.access(targetDir);
      // 已存在，需要添加序号
      conflict = true;
      let counter = 1;
      while (true) {
        const newName = `${finalName} (${counter})`;
        const newPath = path.join(targetPath, newName);
        try {
          await fs.access(newPath);
          counter++;
        } catch {
          conflictResolvedName = newName;
          break;
        }
      }
    } catch {
      // 目录不存在，可以直接使用
    }
    
    preview.push({
      originalName: dir.name,
      proposedName: dir.proposedName,
      finalName: conflictResolvedName || finalName,
      fullPath: dir.path,
      fileCount: dir.fileCount,
      hasConflict: conflict,
      conflictResolvedName,
    });
  }
  
  return preview;
}

// 执行修复
async function repairHiddenDirectories(targetPath) {
  const hiddenDirs = await detectHiddenDirectories(targetPath);
  
  if (hiddenDirs.length === 0) {
    return { success: true, message: '未发现需要修复的隐藏目录', repaired: [] };
  }
  
  const preview = await generateRepairPreview(hiddenDirs, targetPath);
  const repaired = [];
  const failed = [];
  
  for (const item of preview) {
    try {
      const newPath = path.join(targetPath, item.finalName);
      await fs.rename(item.fullPath, newPath);
      repaired.push({
        from: item.originalName,
        to: item.finalName,
        fileCount: item.fileCount,
      });
    } catch (e) {
      failed.push({
        from: item.originalName,
        error: e.message,
      });
    }
  }
  
  return {
    success: failed.length === 0,
    repaired,
    failed,
    message: failed.length === 0 
      ? `成功修复 ${repaired.length} 个隐藏目录` 
      : `修复完成：${repaired.length} 个成功，${failed.length} 个失败`,
  };
}

function normalizeFailedCode(errorCode) {
  switch (errorCode) {
    case 'SOURCE_NOT_FOUND':
      return 'SOURCE_NOT_FOUND';
    case 'TARGET_DIR_NOT_FOUND':
      return 'TARGET_DIR_NOT_FOUND';
    case 'TARGET_DIR_CREATE_FAILED':
      return 'TARGET_DIR_CREATE_FAILED';
    case 'MOVE_FAILED':
      return 'MOVE_FAILED';
    case 'PERMISSION_DENIED':
      return 'PERMISSION_DENIED';
    case 'FILE_LOCKED':
      return 'FILE_IN_USE';
    case 'INVALID_PATH_CHARS':
      return 'SPECIAL_CHAR_PATH_ERROR';
    case 'INVALID_PATH':
      return 'PATH_PARSE_ERROR';
    case 'CROSS_VOLUME_FAILED':
    case 'CROSS_VOLUME_MOVE':
      return 'CROSS_VOLUME_MOVE_FAILED';
    default:
      return 'UNKNOWN_ERROR';
  }
}

function ensureInsideRoot(targetRoot, candidatePath) {
  const root = path.resolve(targetRoot);
  const candidate = path.resolve(candidatePath);
  if (candidate === root) return true;
  return candidate.startsWith(`${root}${path.sep}`);
}

function buildFolderPathMaps(targetRoot, folders) {
  const byId = new Map();
  folders.forEach((folder) => byId.set(folder.folderId, folder));

  const absCache = new Map();

  function resolveFolderAbs(folderId) {
    if (absCache.has(folderId)) return absCache.get(folderId);
    const folder = byId.get(folderId);
    if (!folder) return null;
    if (!folder.pathName || folder.pathName.startsWith('.') || folder.pathName.includes('/') || folder.pathName.includes('\\')) {
      return null;
    }

    if (!folder.parentFolderId) {
      const abs = path.join(targetRoot, folder.pathName);
      absCache.set(folderId, abs);
      return abs;
    }

    const parentAbs = resolveFolderAbs(folder.parentFolderId);
    if (!parentAbs) return null;
    const abs = path.join(parentAbs, folder.pathName);
    absCache.set(folderId, abs);
    return abs;
  }

  for (const folder of folders) {
    resolveFolderAbs(folder.folderId);
  }

  return {
    byId,
    absById: absCache,
  };
}

function collectRequiredFolderIds(schemeFolders, plannedMoves) {
  const folderById = new Map();
  (schemeFolders || []).forEach((folder) => folderById.set(folder.folderId, folder));

  const required = new Set();

  function markWithParents(folderId) {
    let current = folderId;
    const seen = new Set();
    while (current && !seen.has(current)) {
      seen.add(current);
      const folder = folderById.get(current);
      if (!folder) break;
      required.add(current);
      current = folder.parentFolderId || null;
    }
  }

  for (const move of plannedMoves) {
    if (!move?.targetFolderId) continue;
    markWithParents(move.targetFolderId);
  }

  return required;
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

async function executeOrganizationScheme(taskPayload) {
  const taskId = taskPayload.taskId || `${Date.now()}`;
  const targetPath = taskPayload.targetPath;
  const scheme = taskPayload.scheme;
  const scannedCount = taskPayload.scannedCount || 0;
  const checkpoint = taskPayload.checkpoint || null;
  const batchSize = Number.isInteger(taskPayload.batchSize) && taskPayload.batchSize > 0 ? taskPayload.batchSize : 200;
  const maxBatchesPerRun =
    Number.isInteger(taskPayload.maxBatchesPerRun) && taskPayload.maxBatchesPerRun > 0
      ? taskPayload.maxBatchesPerRun
      : null;

  schemaValidator.assertValid('organization-scheme.schema.json', scheme, 'OrganizationScheme validation failed before execution');

  await fs.mkdir(TASKS_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
  await taskService.ensureStorage();

  const logger = new OperationLogger(taskId);
  const plannedMoves = (scheme.moves || []).filter((move) => move.statusHint === 'planned');
  const nonPlannedMoves = (scheme.moves || []).filter((move) => move.statusHint !== 'planned');
  const totalBatches = Math.max(1, Math.ceil(Math.max(plannedMoves.length, 1) / batchSize));

  const task = checkpoint?.task || {
    taskId,
    targetPath,
    schemeId: scheme.schemeId,
    status: 'running',
    plannedMoveCount: plannedMoves.length,
    completedMoveCount: 0,
    failedMoveCount: 0,
    skippedMoveCount: 0,
    createdFolders: [],
    rollbackMap: [],
    batchInfo: {
      currentBatch: 1,
      totalBatches,
    },
    createdAt: new Date().toISOString(),
    finishedAt: null,
  };

  const receipt = checkpoint?.receipt || {
    taskId,
    schemeId: scheme.schemeId,
    targetPath,
    summary: {
      plannedCount: plannedMoves.length,
      executedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
    },
    createdFolders: [],
    moves: [],
    scannedCount,
    createdAt: task.createdAt,
    finishedAt: null,
  };

  let nextPlannedIndex = checkpoint?.nextPlannedIndex || 0;
  let nonPlannedRecorded = Boolean(checkpoint?.nonPlannedRecorded);
  let uncertainFilesRecorded = Boolean(checkpoint?.uncertainFilesRecorded);

  task.status = 'running';
  task.finishedAt = null;
  task.batchInfo = {
    currentBatch: Math.min(totalBatches, Math.floor(nextPlannedIndex / batchSize) + 1),
    totalBatches,
  };

  const persistCheckpoint = async () => {
    const snapshot = {
      taskId,
      schemeId: scheme.schemeId,
      targetPath,
      scannedCount,
      batchSize,
      totalBatches,
      nextPlannedIndex,
      nonPlannedRecorded,
      uncertainFilesRecorded,
      task,
      receipt,
      scheme,
      updatedAt: new Date().toISOString(),
    };
    await taskService.saveCheckpoint(snapshot);
    await taskService.saveTask(task);
  };

  try {
    const { byId, absById } = buildFolderPathMaps(targetPath, scheme.folders || []);
    const requiredFolderIds = collectRequiredFolderIds(scheme.folders || [], plannedMoves);

    // 阶段1：仅为 planned move 创建必需目录（严格 targetRoot 沙箱）
    for (const folder of scheme.folders || []) {
      if (!requiredFolderIds.has(folder.folderId)) continue;
      const folderAbs = absById.get(folder.folderId);
      if (!folderAbs) {
        await logger.warn('跳过非法目录定义', folder);
        continue;
      }
      if (!ensureInsideRoot(targetPath, folderAbs)) {
        await logger.error('检测到路径逃逸，拒绝创建目录', { folderAbs, targetPath });
        throw new Error(`路径逃逸: ${folderAbs}`);
      }

      const dirResult = await ensureTargetDir(folderAbs, logger);
      if (dirResult.success && dirResult.created) {
        if (!task.createdFolders.includes(folderAbs)) task.createdFolders.push(folderAbs);
        if (!receipt.createdFolders.includes(folderAbs)) receipt.createdFolders.push(folderAbs);
      } else if (!dirResult.success) {
        receipt.moves.push({
          fileId: `folder-create:${folder.folderId}`,
          fileName: folder.displayName || folder.pathName,
          sourcePath: '',
          targetPath: folderAbs,
          status: 'failed',
          errorCode: normalizeFailedCode(dirResult.error.errorCode),
          errorMessage: dirResult.error.userMessage,
        });
      }
    }

    if (!nonPlannedRecorded) {
      for (const move of nonPlannedMoves) {
        if (!move.fileId || !move.sourcePath) {
          task.skippedMoveCount += 1;
          receipt.summary.skippedCount += 1;
          receipt.moves.push({
            fileId: move.fileId || 'missing-file-id',
            fileName: move.fileName || 'unknown',
            sourcePath: move.sourcePath || '',
            targetPath: move.targetPath || '',
            status: 'skipped',
            reason: '缺少 fileId/sourcePath',
            ...extractSceneFields(move),
          });
          continue;
        }
        task.skippedMoveCount += 1;
        receipt.summary.skippedCount += 1;
        receipt.moves.push({
          fileId: move.fileId,
          fileName: move.fileName,
          sourcePath: move.sourcePath,
          targetPath: move.targetPath,
          status: 'skipped',
          reason: move.statusHint === 'uncertain' ? '待确认文件' : '规则跳过',
          ...extractSceneFields(move),
        });
      }
      nonPlannedRecorded = true;
    }

    if (!uncertainFilesRecorded) {
      const uncertainMoveSources = new Set(
        nonPlannedMoves
          .filter((move) => move.statusHint === 'uncertain')
          .map((move) => move.sourcePath)
      );

      for (const [index, uncertain] of (scheme.uncertainFiles || []).entries()) {
        if (!uncertain?.sourcePath) continue;
        if (uncertainMoveSources.has(uncertain.sourcePath)) continue;
        task.skippedMoveCount += 1;
        receipt.summary.skippedCount += 1;
        receipt.moves.push({
          fileId: `uncertain:${index}:${path.basename(uncertain.sourcePath)}`,
          fileName: uncertain.fileName || path.basename(uncertain.sourcePath),
          sourcePath: uncertain.sourcePath,
          targetPath: uncertain.sourcePath,
          status: 'skipped',
          reason: '待确认，未自动移动',
          ...extractSceneFields(uncertain),
        });
      }
      uncertainFilesRecorded = true;
    }

    let processedBatches = 0;
    while (nextPlannedIndex < plannedMoves.length) {
      if (maxBatchesPerRun !== null && processedBatches >= maxBatchesPerRun) break;

      const batchStart = nextPlannedIndex;
      const batchEnd = Math.min(batchStart + batchSize, plannedMoves.length);
      task.batchInfo = {
        currentBatch: Math.floor(batchStart / batchSize) + 1,
        totalBatches,
      };

      for (let idx = batchStart; idx < batchEnd; idx += 1) {
        const move = plannedMoves[idx];
        const folder = byId.get(move.targetFolderId);
        const folderAbs = absById.get(move.targetFolderId);
        if (!folder || !folderAbs) {
          task.failedMoveCount += 1;
          receipt.summary.failedCount += 1;
          receipt.moves.push({
            fileId: move.fileId,
            fileName: move.fileName,
            sourcePath: move.sourcePath,
            targetPath: move.targetPath,
            status: 'failed',
            errorCode: 'TARGET_DIR_NOT_FOUND',
            errorMessage: `未找到目标目录: ${move.targetFolderId}`,
            reason: move.reason || '目标目录缺失',
            ...extractSceneFields(move),
          });
          continue;
        }

        const expectedTargetPath = path.join(folderAbs, move.fileName);
        const moveTargetPath = path.resolve(move.targetPath);
        const expectedResolved = path.resolve(expectedTargetPath);

        if (moveTargetPath !== expectedResolved) {
          task.failedMoveCount += 1;
          receipt.summary.failedCount += 1;
          receipt.moves.push({
            fileId: move.fileId,
            fileName: move.fileName,
            sourcePath: move.sourcePath,
            targetPath: move.targetPath,
            status: 'failed',
            errorCode: 'PATH_PARSE_ERROR',
            errorMessage: '计划目标路径与目录映射不一致',
            reason: move.reason || '目标路径映射冲突',
            ...extractSceneFields(move),
          });
          continue;
        }

        if (!ensureInsideRoot(targetPath, expectedResolved)) {
          task.failedMoveCount += 1;
          receipt.summary.failedCount += 1;
          receipt.moves.push({
            fileId: move.fileId,
            fileName: move.fileName,
            sourcePath: move.sourcePath,
            targetPath: move.targetPath,
            status: 'failed',
            errorCode: 'PATH_PARSE_ERROR',
            errorMessage: '目标路径逃逸出 targetRoot，已拒绝执行',
            reason: move.reason || '路径越界',
            ...extractSceneFields(move),
          });
          continue;
        }

        const moveResult = await safeMoveFile(move.sourcePath, expectedResolved, logger);

        if (moveResult.success) {
          task.completedMoveCount += 1;
          receipt.summary.successCount += 1;
          const finalTarget = moveResult.actualTarget || expectedResolved;
          task.rollbackMap.push({
            sourcePath: move.sourcePath,
            targetPath: finalTarget,
          });
          receipt.moves.push({
            fileId: move.fileId,
            fileName: move.fileName,
            sourcePath: move.sourcePath,
            targetPath: finalTarget,
            status: 'success',
            targetFolderName: folder.displayName || folder.pathName,
            reason: move.reason || '执行成功',
            ...extractSceneFields(move),
          });
        } else {
          task.failedMoveCount += 1;
          receipt.summary.failedCount += 1;
          let stillAtOriginalPath = false;
          try {
            await fs.access(move.sourcePath);
            stillAtOriginalPath = true;
          } catch {}

          receipt.moves.push({
            fileId: move.fileId,
            fileName: move.fileName,
            sourcePath: move.sourcePath,
            targetPath: expectedResolved,
            status: 'failed',
            errorCode: normalizeFailedCode(moveResult.error.errorCode),
            errorMessage: moveResult.error.userMessage,
            stillAtOriginalPath,
            reason: move.reason || '移动失败',
            ...extractSceneFields(move),
          });
        }
      }

      nextPlannedIndex = batchEnd;
      processedBatches += 1;
      await persistCheckpoint();
    }

    receipt.summary.executedCount = receipt.summary.successCount + receipt.summary.failedCount;
    receipt.summary.skippedCount = task.skippedMoveCount;

    if (nextPlannedIndex < plannedMoves.length) {
      task.status = 'paused';
      task.finishedAt = null;
      receipt.finishedAt = null;
      schemaValidator.assertValid('execution-task.schema.json', task, 'ExecutionTask validation failed');
      schemaValidator.assertValid('execution-receipt.schema.json', receipt, 'ExecutionReceipt validation failed');
      await persistCheckpoint();
      return {
        success: true,
        paused: true,
        hasRemaining: true,
        task,
        receipt,
        schemeId: scheme.schemeId,
      };
    }

    task.status = 'completed';
    task.finishedAt = new Date().toISOString();
    task.batchInfo = {
      currentBatch: totalBatches,
      totalBatches,
    };
    receipt.finishedAt = task.finishedAt;

    schemaValidator.assertValid('execution-task.schema.json', task, 'ExecutionTask validation failed');
    schemaValidator.assertValid('execution-receipt.schema.json', receipt, 'ExecutionReceipt validation failed');

    await taskService.saveTask(task);
    await taskService.clearCheckpoint(taskId);

    try {
      await saveTask({
        taskId: task.taskId,
        targetPath: task.targetPath,
        schemeId: task.schemeId,
        stats: {
          scanned: scannedCount,
          planned: task.plannedMoveCount,
          attempted: receipt.summary.executedCount,
          succeeded: task.completedMoveCount,
          failed: task.failedMoveCount,
          skipped: task.skippedMoveCount,
        },
        createdFolders: task.createdFolders,
        movedFiles: receipt.moves.filter((m) => m.status === 'success').map((m) => ({
          name: m.fileName,
          source: m.sourcePath,
          target: m.targetPath,
        })),
        skippedFiles: receipt.moves.filter((m) => m.status === 'skipped').map((m) => ({
          name: m.fileName,
          source: m.sourcePath,
          reason: m.reason || '跳过',
        })),
        failedFiles: receipt.moves.filter((m) => m.status === 'failed').map((m) => ({
          name: m.fileName,
          source: m.sourcePath,
          target: m.targetPath,
          reason: m.errorMessage,
          errorCode: m.errorCode || 'UNKNOWN',
        })),
        startedAt: task.createdAt,
        finishedAt: task.finishedAt,
        status: 'completed',
      });
    } catch (persistError) {
      await logger.warn('任务记录写入失败，但执行结果有效', {
        message: persistError.message,
      });
    }

    return {
      success: true,
      paused: false,
      hasRemaining: false,
      task,
      receipt,
      schemeId: scheme.schemeId,
    };
  } catch (error) {
    task.status = 'failed';
    task.finishedAt = new Date().toISOString();
    receipt.finishedAt = task.finishedAt;
    receipt.summary.executedCount = receipt.summary.successCount + receipt.summary.failedCount;

    try {
      schemaValidator.assertValid('execution-task.schema.json', task, 'ExecutionTask validation failed');
      await taskService.saveTask(task);
      await persistCheckpoint();
    } catch (schemaErr) {
      await logger.error('ExecutionTask schema 校验失败', schemaErr.validationErrors || schemaErr.message);
    }

    return {
      success: false,
      error: error.message,
      task,
      receipt,
      schemeId: scheme.schemeId,
    };
  }
}

async function getExecutionCheckpoint(taskId) {
  if (!taskId) return null;
  return taskService.loadCheckpoint(taskId);
}

async function resumeExecutionTask({ taskId, maxBatchesPerRun = null }) {
  const checkpoint = await taskService.loadCheckpoint(taskId);
  if (!checkpoint) {
    return {
      success: false,
      error: '未找到可恢复的 checkpoint',
    };
  }

  return executeOrganizationScheme({
    taskId: checkpoint.taskId,
    targetPath: checkpoint.targetPath,
    scheme: checkpoint.scheme,
    scannedCount: checkpoint.scannedCount,
    batchSize: checkpoint.batchSize,
    maxBatchesPerRun,
    checkpoint,
  });
}

module.exports = {
  executeTask,
  executeOrganizationScheme,
  resumeExecutionTask,
  getExecutionCheckpoint,
  getLatestTask,
  getTaskHistory,
  rollbackLatestTask,
  // 项目保护模式
  scanWithProjectProtection,
  detectProjectRoot,
  // 隐藏目录检测与修复
  detectHiddenDirectories,
  generateRepairPreview,
  repairHiddenDirectories,
};
