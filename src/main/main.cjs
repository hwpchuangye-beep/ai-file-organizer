// Electron 主进程入口
console.log('[Main] ========================================');
console.log('[Main] app starting...');
console.log('[Main] process.argv:', process.argv);
console.log('[Main] process.cwd():', process.cwd());
console.log('[Main] __dirname:', __dirname);
console.log('[Main] process.platform:', process.platform);
console.log('[Main] Electron version:', process.versions.electron);
console.log('[Main] Node version:', process.versions.node);
console.log('[Main] ========================================');

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

console.log('[Main] Modules imported successfully');

// 全局错误捕获
process.on('uncaughtException', (error) => {
  console.error('[Main] UNCAUGHT EXCEPTION:');
  console.error(error);
  console.error('[Main] Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] UNHANDLED REJECTION at:', promise);
  console.error('[Main] reason:', reason);
});

// 引入服务
let modelService;
let executionService;
let profileService;
let planningService;
let verificationService;
let schemaValidatorService;
let ruleConstraintService;
let memoryService;
let servicesLoaded = false;
let servicesLoadError = null;

function loadServices() {
  if (servicesLoaded) return;
  if (servicesLoadError) throw servicesLoadError;

  try {
    modelService = require('./services/modelService.cjs');
    executionService = require('./services/executionService.cjs');
    profileService = require('./services/profileService.cjs');
    planningService = require('./services/planningService.cjs');
    verificationService = require('./services/verificationService.cjs');
    schemaValidatorService = require('./services/schemaValidatorService.cjs');
    ruleConstraintService = require('./services/ruleConstraintService.cjs');
    memoryService = require('./services/memoryService.cjs');
    servicesLoaded = true;
    console.log('[Main] Services loaded successfully');
    return;
  } catch (e) {
    console.error('[Main] Failed to load services (relative):', e.message);
  }

  try {
    modelService = require(path.join(__dirname, 'services', 'modelService.cjs'));
    executionService = require(path.join(__dirname, 'services', 'executionService.cjs'));
    profileService = require(path.join(__dirname, 'services', 'profileService.cjs'));
    planningService = require(path.join(__dirname, 'services', 'planningService.cjs'));
    verificationService = require(path.join(__dirname, 'services', 'verificationService.cjs'));
    schemaValidatorService = require(path.join(__dirname, 'services', 'schemaValidatorService.cjs'));
    ruleConstraintService = require(path.join(__dirname, 'services', 'ruleConstraintService.cjs'));
    memoryService = require(path.join(__dirname, 'services', 'memoryService.cjs'));
    servicesLoaded = true;
    console.log('[Main] Services loaded from absolute path');
  } catch (e2) {
    servicesLoadError = e2;
    console.error('[Main] Failed to load services from all paths:', e2.message);
    throw e2;
  }
}

function ensureServicesReady() {
  try {
    loadServices();
    return null;
  } catch (error) {
    return {
      success: false,
      error: `服务初始化失败: ${error.message}`,
    };
  }
}

let mainWindow = null;
const profileStore = new Map();
const schemeStore = new Map();
const executionStore = new Map();
const verificationStore = new Map();
const watchedTargetStore = new Set();

function isAbsolutePath(targetPath) {
  return typeof targetPath === 'string' && path.isAbsolute(targetPath);
}

function normalizePath(targetPath) {
  return path.resolve(targetPath);
}

function validateTargetAccess(targetPath, sourceType = 'user_selected') {
  if (!isAbsolutePath(targetPath)) {
    return { allowed: false, reason: '路径必须是绝对路径' };
  }

  const normalized = normalizePath(targetPath);
  const desktopPath = normalizePath(path.join(os.homedir(), 'Desktop'));
  const downloadsPath = normalizePath(path.join(os.homedir(), 'Downloads'));

  if (sourceType === 'desktop') {
    return normalized === desktopPath
      ? { allowed: true }
      : { allowed: false, reason: 'desktop 来源只能访问 Desktop 目录' };
  }

  if (sourceType === 'downloads') {
    return normalized === downloadsPath
      ? { allowed: true }
      : { allowed: false, reason: 'downloads 来源只能访问 Downloads 目录' };
  }

  if (sourceType === 'watched') {
    return watchedTargetStore.has(normalized)
      ? { allowed: true }
      : { allowed: false, reason: 'watched 来源目录未授权' };
  }

  // user_selected
  return { allowed: true };
}

function validateSchemeGate({ scheme, profileEntry, targetPath }) {
  const serviceError = ensureServicesReady();
  if (serviceError) {
    return {
      valid: false,
      error: serviceError.error,
      validationErrors: [],
      ruleErrors: [],
    };
  }

  const schemaResult = schemaValidatorService.validateOrganizationScheme(scheme);
  if (!schemaResult.valid) {
    return {
      valid: false,
      error: '方案未通过 schema 校验',
      validationErrors: schemaResult.errors,
    };
  }

  const ruleResult = ruleConstraintService.validateOrganizationSchemeRules({
    scheme,
    profile: profileEntry?.profile,
    files: profileEntry?.files || [],
    targetRoot: targetPath,
  });

  if (!ruleResult.valid) {
    return {
      valid: false,
      error: '方案未通过规则约束校验',
      ruleErrors: ruleResult.errors,
    };
  }

  return { valid: true };
}

// 获取 preload 路径
function getPreloadPath() {
  console.log('[Main] Resolving preload path...');
  console.log('[Main] __dirname:', __dirname);
  
  const possiblePaths = [
    path.join(__dirname, 'preload.cjs'),
    path.join(process.cwd(), 'src', 'main', 'preload.cjs'),
    path.join(process.cwd(), 'dist', 'main', 'preload.cjs'),
  ];
  
  for (const p of possiblePaths) {
    console.log('[Main] Checking:', p, fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND');
    if (fs.existsSync(p)) {
      console.log('[Main] Using preload:', p);
      return p;
    }
  }
  
  console.error('[Main] CRITICAL: preload.cjs not found in any location!');
  return possiblePaths[0];
}

function createWindow() {
  console.log('[Main] createWindow() called');
  
  const preloadPath = getPreloadPath();
  console.log('[Main] Preload path resolved to:', preloadPath);
  
  console.log('[Main] Creating BrowserWindow...');
  
  try {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      titleBarStyle: 'hiddenInset',
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        allowRunningInsecureContent: false,
        webSecurity: true,
      },
    });
    
    console.log('[Main] BrowserWindow created successfully');
    console.log('[Main] Window ID:', mainWindow.id);
    
  } catch (e) {
    console.error('[Main] FAILED to create BrowserWindow:', e);
    console.error('[Main] Stack:', e.stack);
    return;
  }

  const forceShowTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Main] Force showing window (ready-to-show timeout)');
      mainWindow.show();
    }
  }, 2500);

  // 窗口事件监听
  mainWindow.once('ready-to-show', () => {
    clearTimeout(forceShowTimer);
    console.log('[Main] Event: ready-to-show');
    console.log('[Main] Showing window...');
    mainWindow.show();
    
    if (process.env.VITE_DEV_SERVER_URL) {
      console.log('[Main] Opening DevTools...');
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('show', () => {
    console.log('[Main] Event: window shown');
  });

  mainWindow.on('closed', () => {
    clearTimeout(forceShowTimer);
    console.log('[Main] Event: window closed');
    mainWindow = null;
  });

  // 页面加载事件
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('[Main] WebContents: did-start-loading');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] WebContents: did-finish-load');
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('[Main] Showing window after did-finish-load');
      mainWindow.show();
    }
    
    // 验证 electronAPI
    mainWindow.webContents.executeJavaScript(`
      (function() {
        console.log('[Renderer] Checking window.electronAPI...');
        if (typeof window.electronAPI !== 'undefined' && window.electronAPI !== null) {
          console.log('[Renderer] electronAPI is available, methods:', Object.keys(window.electronAPI).length);
          return { success: true, methodCount: Object.keys(window.electronAPI).length };
        } else {
          console.error('[Renderer] electronAPI is NOT available!');
          return { success: false, error: 'electronAPI not found' };
        }
      })()
    `).then(result => {
      if (result.success) {
        console.log('[Main] electronAPI verified, methods:', result.methodCount);
      } else {
        console.error('[Main] electronAPI verification FAILED');
      }
    }).catch(err => {
      console.error('[Main] Error verifying electronAPI:', err);
    });
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Main] WebContents: did-fail-load');
    console.error('[Main] Error code:', errorCode);
    console.error('[Main] Error description:', errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[Main] WebContents: render-process-gone');
    console.error('[Main] Details:', details);
  });

  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('[Main] WebContents: crashed, killed:', killed);
  });

  // 控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['debug', 'log', 'warn', 'error'];
    const levelName = levels[level] || 'log';
    console.log(`[Renderer:${levelName}] ${message}`);
  });

  // 加载页面
  if (process.env.VITE_DEV_SERVER_URL) {
    const url = process.env.VITE_DEV_SERVER_URL;
    console.log('[Main] Loading dev server URL:', url);
    
    // 直接加载，让 Electron 自己处理重试
    console.log('[Main] Loading URL directly...');
    mainWindow.loadURL(url).then(() => {
      console.log('[Main] loadURL succeeded');
    }).catch(err => {
      console.error('[Main] loadURL FAILED:', err);
      // 失败后再试一次
      setTimeout(() => {
        console.log('[Main] Retrying loadURL...');
        mainWindow.loadURL(url);
      }, 1000);
    });
    
  } else {
    const htmlPath = path.join(__dirname, '../renderer/index.html');
    console.log('[Main] Loading production file:', htmlPath);
    console.log('[Main] File exists:', fs.existsSync(htmlPath));
    
    mainWindow.loadFile(htmlPath).then(() => {
      console.log('[Main] loadFile succeeded');
    }).catch(err => {
      console.error('[Main] loadFile FAILED:', err);
    });
  }
  
  console.log('[Main] createWindow() completed');
}

// 应用生命周期
console.log('[Main] Setting up app lifecycle handlers...');

app.whenReady().then(() => {
  console.log('[Main] ========================================');
  console.log('[Main] app.whenReady() entered');
  console.log('[Main] ========================================');
  createWindow();
}).catch(err => {
  console.error('[Main] app.whenReady() FAILED:', err);
});

app.on('window-all-closed', () => {
  console.log('[Main] Event: window-all-closed');
  if (process.platform !== 'darwin') {
    console.log('[Main] Quitting app (non-darwin platform)');
    app.quit();
  } else {
    console.log('[Main] Not quitting (darwin platform)');
  }
});

app.on('activate', () => {
  console.log('[Main] Event: activate');
  if (mainWindow === null) {
    console.log('[Main] Recreating window...');
    createWindow();
  }
});

app.on('quit', () => {
  console.log('[Main] Event: quit');
});

app.on('before-quit', () => {
  console.log('[Main] Event: before-quit');
});

// IPC Handlers
console.log('[Main] Setting up IPC handlers...');

ipcMain.handle('select-directory', async () => {
  console.log('[Main] IPC: select-directory');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-desktop-path', () => {
  return path.join(os.homedir(), 'Desktop');
});

ipcMain.handle('get-downloads-path', () => {
  return path.join(os.homedir(), 'Downloads');
});

ipcMain.handle('build-directory-profile', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { targetPath, sourceType = 'user_selected', watched = false } = payload;
    const access = validateTargetAccess(targetPath, sourceType);
    if (!access.allowed) {
      return { success: false, error: access.reason };
    }

    const preferenceMemory = await memoryService.getPreferenceMemory();
    const preferenceHits = memoryService.buildPreferenceHits(normalizePath(targetPath), preferenceMemory);

    const result = await profileService.buildDirectoryProfile({
      targetPath: normalizePath(targetPath),
      sourceType,
      watched,
      preferenceHits,
    });

    profileStore.set(result.profile.profileId, {
      profile: result.profile,
      files: result.files,
      createdAt: new Date().toISOString(),
    });

    if (watched) {
      watchedTargetStore.add(normalizePath(targetPath));
    }

    return {
      success: true,
      profile: result.profile,
    };
  } catch (error) {
    console.error('[Main] build-directory-profile error:', error);
    return {
      success: false,
      error: error.message,
      validationErrors: error.validationErrors || [],
    };
  }
});

ipcMain.handle('generate-organization-schemes', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { profileId, modelConfig } = payload;
    const profileEntry = profileStore.get(profileId);
    if (!profileEntry) {
      return { success: false, error: '未找到目录画像，请先重新扫描' };
    }

    const preferenceMemory = await memoryService.getPreferenceMemory();
    const startAt = Date.now();
    console.log(
      `[Main] generate-organization-schemes start profileId=${profileId} files=${profileEntry.files?.length || 0}`,
    );
    const PLANNING_TIMEOUT_MS = 120000;
    const generated = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('整理方案生成超时（120s），请减少目录范围后重试'));
      }, PLANNING_TIMEOUT_MS);

      planningService
        .generateSchemes({
          profile: profileEntry.profile,
          files: profileEntry.files,
          preferenceMemory,
        })
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
    console.log(
      `[Main] generate-organization-schemes done profileId=${profileId} elapsedMs=${Date.now() - startAt}`,
    );

    let finalSchemes = generated.schemes || [];
    let finalRecommendedSchemeId = generated.recommendedSchemeId || null;
    let plannerSource = 'rules';
    let plannerModel = null;
    let plannerMessage = '规则引擎已完成方案推荐';

    if (modelConfig?.baseUrl && modelConfig?.modelName && typeof modelService?.recommendOrganizationScheme === 'function') {
      const modelDecision = await modelService.recommendOrganizationScheme({
        profile: profileEntry.profile,
        schemes: finalSchemes,
        modelConfig,
      });

      if (modelDecision?.success && modelDecision.recommendedSchemeId) {
        plannerSource = 'model';
        plannerModel = modelDecision.modelName || modelConfig.modelName;
        plannerMessage = modelDecision.reason || '模型已完成候选方案推荐决策';
        console.log(`[Main] model recommendation applied model=${plannerModel} schemeId=${modelDecision.recommendedSchemeId}`);

        const preferredId = modelDecision.recommendedSchemeId;
        const preferred = finalSchemes.find((scheme) => scheme.schemeId === preferredId);
        if (preferred) {
          const others = finalSchemes.filter((scheme) => scheme.schemeId !== preferredId);
          finalSchemes = [
            { ...preferred, isRecommended: true },
            ...others.map((scheme) => ({ ...scheme, isRecommended: false })),
          ];
          finalRecommendedSchemeId = preferredId;
        }
      } else {
        plannerSource = 'rules';
        plannerModel = modelConfig.modelName;
        plannerMessage = modelDecision?.message || '模型推荐不可用，已回退规则引擎';
        console.log(`[Main] model recommendation fallback to rules model=${plannerModel} message=${plannerMessage}`);
      }
    }

    for (const scheme of finalSchemes) {
      schemeStore.set(scheme.schemeId, {
        scheme,
        profileId,
        targetPath: profileEntry.profile.target.path,
        scannedCount: profileEntry.profile.scanStats.totalFiles,
        approved: false,
        createdAt: new Date().toISOString(),
      });
    }

    return {
      success: true,
      recommendedSchemeId: finalRecommendedSchemeId,
      schemes: finalSchemes,
      plannerSource,
      plannerModel,
      plannerMessage,
    };
  } catch (error) {
    console.error('[Main] generate-organization-schemes error:', error);
    return {
      success: false,
      error: error.message,
      validationErrors: error.validationErrors || [],
    };
  }
});

ipcMain.handle('approve-organization-scheme', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { schemeId, schemeOverride } = payload;
    const record = schemeStore.get(schemeId);
    if (!record) {
      return { success: false, error: '未找到整理方案' };
    }

    const profileEntry = profileStore.get(record.profileId);
    if (!profileEntry) {
      return { success: false, error: '未找到目录画像，无法审批方案' };
    }

    let candidateScheme = record.scheme;
    if (schemeOverride) {
      candidateScheme = schemeOverride;
    }

    const gate = validateSchemeGate({
      scheme: candidateScheme,
      profileEntry,
      targetPath: record.targetPath,
    });

    if (!gate.valid) {
      return {
        success: false,
        error: gate.error,
        validationErrors: gate.validationErrors || [],
        ruleErrors: gate.ruleErrors || [],
      };
    }

    record.scheme = candidateScheme;
    record.approved = true;
    record.approvedAt = new Date().toISOString();
    schemeStore.set(schemeId, record);

    return { success: true, schemeId, scheme: record.scheme };
  } catch (error) {
    console.error('[Main] approve-organization-scheme error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('execute-approved-scheme', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { schemeId, taskId, batchSize, maxBatchesPerRun } = payload;
    const record = schemeStore.get(schemeId);
    if (!record) {
      return { success: false, error: '未找到整理方案' };
    }
    if (!record.approved) {
      return { success: false, error: '方案未审批，禁止执行' };
    }

    const profileEntry = profileStore.get(record.profileId);
    if (!profileEntry) {
      return { success: false, error: '未找到目录画像，禁止执行' };
    }

    const gate = validateSchemeGate({
      scheme: record.scheme,
      profileEntry,
      targetPath: record.targetPath,
    });

    if (!gate.valid) {
      return {
        success: false,
        error: gate.error,
        validationErrors: gate.validationErrors || [],
        ruleErrors: gate.ruleErrors || [],
      };
    }

    const executeResult = await executionService.executeOrganizationScheme({
      taskId,
      targetPath: record.targetPath,
      scheme: record.scheme,
      scannedCount: record.scannedCount,
      batchSize,
      maxBatchesPerRun,
    });

    if (!executeResult.success) {
      return { success: false, error: executeResult.error, task: executeResult.task, receipt: executeResult.receipt };
    }

    executionStore.set(executeResult.task.taskId, {
      task: executeResult.task,
      receipt: executeResult.receipt,
      schemeId,
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      task: executeResult.task,
      receipt: executeResult.receipt,
      paused: Boolean(executeResult.paused),
      hasRemaining: Boolean(executeResult.hasRemaining),
    };
  } catch (error) {
    console.error('[Main] execute-approved-scheme error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('resume-execution-task', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { taskId, maxBatchesPerRun } = payload;
    if (!taskId) {
      return { success: false, error: '缺少 taskId' };
    }

    const resumeResult = await executionService.resumeExecutionTask({
      taskId,
      maxBatchesPerRun,
    });

    if (!resumeResult.success) {
      return { success: false, error: resumeResult.error, task: resumeResult.task, receipt: resumeResult.receipt };
    }

    executionStore.set(resumeResult.task.taskId, {
      task: resumeResult.task,
      receipt: resumeResult.receipt,
      schemeId: resumeResult.schemeId || null,
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      task: resumeResult.task,
      receipt: resumeResult.receipt,
      paused: Boolean(resumeResult.paused),
      hasRemaining: Boolean(resumeResult.hasRemaining),
    };
  } catch (error) {
    console.error('[Main] resume-execution-task error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-execution-checkpoint', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { taskId } = payload;
    if (!taskId) {
      return { success: false, error: '缺少 taskId' };
    }
    const checkpoint = await executionService.getExecutionCheckpoint(taskId);
    return { success: true, checkpoint };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-preference-memory', async () => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const memory = await memoryService.getPreferenceMemory();
    return { success: true, memory };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-preference-memory', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const memory = await memoryService.savePreferenceMemory(payload.memory);
    return { success: true, memory };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      validationErrors: error.validationErrors || [],
    };
  }
});

ipcMain.handle('update-preference-memory', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const memory = await memoryService.updatePreferenceMemory(payload.patch || {});
    return { success: true, memory };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      validationErrors: error.validationErrors || [],
    };
  }
});

ipcMain.handle('verify-execution-task', async (_, payload = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { taskId } = payload;
    const record = executionStore.get(taskId);
    if (!record) {
      return { success: false, error: '未找到执行任务' };
    }

    const report = await verificationService.verifyExecution({
      task: record.task,
      receipt: record.receipt,
    });

    verificationStore.set(taskId, report);

    return {
      success: true,
      report,
    };
  } catch (error) {
    console.error('[Main] verify-execution-task error:', error);
    return {
      success: false,
      error: error.message,
      validationErrors: error.validationErrors || [],
    };
  }
});

ipcMain.handle('scan-directory', async (_, dirPath, options = {}) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const { projectProtection = true } = options;
    
    if (projectProtection) {
      // 使用项目保护模式扫描
      const scanResult = await executionService.scanWithProjectProtection(dirPath);
      return { 
        success: true, 
        files: scanResult.files,
        protectedProjects: scanResult.protectedProjects,
        protectedFileCount: scanResult.protectedFileCount,
        totalFiles: scanResult.totalFiles,
      };
    } else {
      // 传统扫描模式（无保护）
      const files = await scanDirectory(dirPath);
      return { success: true, files };
    }
  } catch (error) {
    console.error('[Main] scan-directory error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-model-connection', async (_, config) => {
  const serviceError = ensureServicesReady();
  if (serviceError) return serviceError;
  return await modelService.testConnection(config);
});

ipcMain.handle('get-models', async (_, config) => {
  const serviceError = ensureServicesReady();
  if (serviceError) return serviceError;
  return await modelService.getModels(config);
});

ipcMain.handle('generate-schemes', async (_, scanResult, modelConfig) => {
  return {
    success: false,
    error: 'Legacy generate-schemes is disabled. Use build-directory-profile + generate-organization-schemes.',
  };
});

ipcMain.handle('execute-task', async (_, taskPayload) => {
  // 后端门禁：禁止绕过审批直接执行
  return {
    success: false,
    error: 'Direct execute-task is disabled. Use approve-organization-scheme + execute-approved-scheme.',
  };
});

ipcMain.handle('get-latest-task', async () => {
  const serviceError = ensureServicesReady();
  if (serviceError) return serviceError;
  return await executionService.getLatestTask();
});

ipcMain.handle('get-task-history', async () => {
  const serviceError = ensureServicesReady();
  if (serviceError) return serviceError;
  return await executionService.getTaskHistory();
});

ipcMain.handle('rollback-latest-task', async () => {
  const serviceError = ensureServicesReady();
  if (serviceError) return serviceError;
  return await executionService.rollbackLatestTask();
});

ipcMain.handle('show-in-folder', async (_, filePath) => {
  try {
    // 确保文件存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: '文件不存在: ' + filePath };
    }
    
    // 使用 macOS 的 open -R 命令，在 Finder 中显示并选中文件
    return new Promise((resolve) => {
      exec(`open -R "${filePath}"`, (error) => {
        if (error) {
          console.error('[Main] show-in-folder error:', error);
          resolve({ success: false, error: error.message });
        } else {
          console.log('[Main] show-in-folder success:', filePath);
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] show-in-folder exception:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder', async (_, folderPath) => {
  try {
    // 确保路径存在
    if (!fs.existsSync(folderPath)) {
      return { success: false, error: '文件夹不存在: ' + folderPath };
    }
    
    // 使用 macOS 的 open 命令，比 shell.openPath 更可靠
    return new Promise((resolve) => {
      exec(`open "${folderPath}"`, (error) => {
        if (error) {
          console.error('[Main] open-folder error:', error);
          resolve({ success: false, error: error.message });
        } else {
          console.log('[Main] open-folder success:', folderPath);
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] open-folder exception:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('detect-hidden-directories', async (_, targetPath) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const hiddenDirs = await executionService.detectHiddenDirectories(targetPath);
    return { success: true, hiddenDirs };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-repair-preview', async (_, targetPath) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const hiddenDirs = await executionService.detectHiddenDirectories(targetPath);
    if (hiddenDirs.length === 0) {
      return { success: true, preview: [], message: '未发现隐藏目录' };
    }
    const preview = await executionService.generateRepairPreview(hiddenDirs, targetPath);
    return { success: true, preview, hiddenCount: hiddenDirs.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('repair-hidden-directories', async (_, targetPath) => {
  try {
    const serviceError = ensureServicesReady();
    if (serviceError) return serviceError;

    const result = await executionService.repairHiddenDirectories(targetPath);
    return { success: result.success, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

console.log('[Main] IPC handlers setup complete');
console.log('[Main] Waiting for app.whenReady()...');

// Helper Functions
async function scanDirectory(dirPath) {
  const files = [];
  
  async function scan(currentPath, relativePath = '') {
    let entries;
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch (err) {
      return;
    }
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath, relPath);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.promises.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            size: stats.size,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            extension: path.extname(entry.name).toLowerCase(),
          });
        } catch (e) {}
      }
    }
  }
  
  await scan(dirPath);
  return files;
}
