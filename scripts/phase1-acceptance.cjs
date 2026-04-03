#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const ACCEPTANCE_ROOT = path.join(os.tmpdir(), 'ai-file-organizer-phase1-acceptance');
const ACCEPTANCE_HOME = path.join(os.tmpdir(), 'ai-file-organizer-phase1-home');

process.env.HOME = ACCEPTANCE_HOME;

const profileService = require(path.join(REPO_ROOT, 'src/main/services/profileService.cjs'));
const planningService = require(path.join(REPO_ROOT, 'src/main/services/planningService.cjs'));
const executionService = require(path.join(REPO_ROOT, 'src/main/services/executionService.cjs'));
const verificationService = require(path.join(REPO_ROOT, 'src/main/services/verificationService.cjs'));
const schemaValidator = require(path.join(REPO_ROOT, 'src/main/services/schemaValidatorService.cjs'));
const ruleConstraintService = require(path.join(REPO_ROOT, 'src/main/services/ruleConstraintService.cjs'));
const sceneTaxonomy = require(path.join(REPO_ROOT, 'src/shared/config/scene-taxonomy.json'));

const DOC_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md', '.pdf', '.pages']);

const SCENE_ACCEPTANCE_CASES = [
  { category: '简历', fileName: '简历_resume_求职_2026.pdf' },
  { category: '合同', fileName: '客户合同_协议_签约_2026.pdf' },
  { category: '发票', fileName: '发票_invoice_税票_2026.pdf' },
  { category: '报销材料', fileName: '报销材料_差旅报销_费用报销_2026.pdf' },
  { category: 'PRD', fileName: 'PRD_产品需求文档_需求规格_v3.docx' },
  { category: '会议纪要', fileName: '会议纪要_meeting notes_行动项_2026.md' },
  { category: '调研报告', fileName: '调研报告_研究报告_行业研究_2026.pdf' },
  { category: '竞品分析', fileName: '竞品分析_对标分析_benchmark_2026.docx' },
  { category: '作品集', fileName: '作品集_portfolio_案例集_2026.pdf' },
  { category: '培训资料', fileName: '培训资料_培训课件_training_2026.pptx' },
  { category: '证件材料', fileName: '证件材料_身份证_资格证_合集.pdf' },
  { category: '申请材料', fileName: '申请材料_申请书_application_2026.docx' },
  { category: '报价单', fileName: '报价单_报价方案_quotation_2026.xlsx' },
  { category: '需求文档', fileName: '需求文档_功能需求_需求清单_v2.docx' },
  { category: '软件安装包', fileName: '软件安装包_installer_setup_v1.2.dmg' },
  { category: '压缩包', fileName: '压缩包_archive_backup_2026.zip' },
];

const SCENE_FALSE_POSITIVE_CASES = [
  { fileName: 'alpha_record_2026.txt' },
  { fileName: 'beta_metrics_2026.csv' },
  { fileName: 'gamma_screenshot_001.png' },
  { fileName: 'delta_script_cleanup.js' },
  { fileName: 'epsilon_manual_reference.docx' },
  { fileName: 'zeta_monthly_log.md' },
  { fileName: 'eta_finance_table.xlsx' },
  { fileName: 'theta_raw_data.bin' },
  { fileName: 'iota_whitepaper.pdf' },
  { fileName: 'kappa_photo_2026.jpg' },
  { fileName: 'lambda_audio_demo.mp3' },
  { fileName: 'mu_clip_2026.mp4' },
];

const SCENE_MIXED_REAL_CASES = [
  { fileName: '候选人简历_产品经理_张三.pdf', expectedScene: '简历' },
  { fileName: '客户主合同_续签_2026.pdf', expectedScene: '合同' },
  { fileName: '4月增值税发票_华东区.pdf', expectedScene: '发票' },
  { fileName: 'PRD_支付体验改版_v3.docx', expectedScene: 'PRD' },
  { fileName: '会议纪要_产品周会_0403.md', expectedScene: '会议纪要' },
  { fileName: '调研报告_用户访谈总结_2026.pdf', expectedScene: '调研报告' },
  { fileName: '竞品分析_对标拆解_年度版.docx', expectedScene: '竞品分析' },
  { fileName: '报价单_企业版方案_0420.xlsx', expectedScene: '报价单' },
  { fileName: '软件安装包_desktop_client_2.1.0.dmg', expectedScene: '软件安装包' },
  { fileName: '压缩包_logs_backup_202604.zip', expectedScene: '压缩包' },
  { fileName: '需求草稿_头脑风暴.docx', expectedScene: null },
  { fileName: '培训记录_随手记.txt', expectedScene: null },
  { fileName: 'notes_general_2026.docx', expectedScene: null },
  { fileName: 'random_capture_202604.png', expectedScene: null },
  { fileName: 'data_export_202604.csv', expectedScene: null },
  { fileName: 'manual_reference_v2.pdf', expectedScene: null },
];

const RESUME_PRIORITY_POSITIVE_CASES = [
  '5年产品经理--贺稳鹏.pdf',
  '产品经理--贺稳鹏 .docx',
  '产品经理--贺稳鹏 .pdf',
  '产品经理--贺稳鹏.pdf',
  '产品经理-贺稳鹏简历.pdf',
  '产品经理-贺稳鹏的副本 (自动保存的).docx',
  '产品经理简历.pdf',
  '产品经理贺稳鹏简历.pdf',
];

const RESUME_PRIORITY_NEGATIVE_CASES = [
  '产品经理能力模型.pdf',
  '产品岗位说明书.pdf',
];

const STRONG_SCENE_PRIORITY_CASES = [
  {
    sceneCategory: '简历',
    positiveFile: '产品经理-贺稳鹏简历.pdf',
    negativeFile: '产品经理能力模型.pdf',
  },
  {
    sceneCategory: '合同',
    positiveFile: '客户主合同_签约版_2026.pdf',
    negativeFile: '客户商务合作方案.pdf',
  },
  {
    sceneCategory: '发票',
    positiveFile: '增值税专用发票_202604.pdf',
    negativeFile: '税务缴费通知.pdf',
  },
  {
    sceneCategory: 'PRD',
    positiveFile: 'PRD_产品需求文档_支付改版_v3.docx',
    negativeFile: '需求评审结论.docx',
  },
  {
    sceneCategory: '会议纪要',
    positiveFile: '会议纪要_产品周会_0403.md',
    negativeFile: '会议室预定说明.docx',
  },
];

function assert(condition, message, details) {
  if (!condition) {
    const err = new Error(message);
    err.details = details;
    throw err;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function resetDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
  await fsp.mkdir(dirPath, { recursive: true });
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeText(filePath, content = 'acceptance-file') {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content, 'utf8');
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function plannedMoveCount(scheme) {
  return (scheme.moves || []).filter((move) => move.statusHint === 'planned').length;
}

function summarizePlan(scheme) {
  return {
    schemeType: scheme.schemeType,
    confidence: scheme.confidence,
    confidenceLevel: scheme.confidenceLevel,
    plannedMoves: plannedMoveCount(scheme),
    uncertainFiles: (scheme.uncertainFiles || []).length,
    folderCount: (scheme.folders || []).length,
  };
}

function buildDecisionIndexByFileName(scheme) {
  const index = new Map();
  for (const move of scheme.moves || []) {
    index.set(move.fileName, move);
  }
  for (const uncertain of scheme.uncertainFiles || []) {
    if (!uncertain?.fileName) continue;
    if (!index.has(uncertain.fileName)) {
      index.set(uncertain.fileName, uncertain);
    }
  }
  return index;
}

function pickRecommendedScheme(generated) {
  return generated.schemes.find((item) => item.schemeId === generated.recommendedSchemeId) || generated.schemes[0];
}

function extName(fileName) {
  return path.extname(fileName || '').toLowerCase();
}

function baselineSceneCategory(fileName) {
  const ext = extName(fileName);
  const installerExt = new Set(['.dmg', '.pkg', '.apk', '.ipa', '.exe', '.msi']);
  const archiveExt = new Set(['.zip', '.rar', '.7z', '.tar', '.gz']);
  if (installerExt.has(ext)) return '软件安装包';
  if (archiveExt.has(ext)) return '压缩包';
  return null;
}

function evaluateGate({ scheme, profile, files, targetRoot }) {
  const schemaResult = schemaValidator.validateOrganizationScheme(scheme);
  const ruleResult = ruleConstraintService.validateOrganizationSchemeRules({
    scheme,
    profile,
    files,
    targetRoot,
  });
  return {
    passed: schemaResult.valid && ruleResult.valid,
    schemaResult,
    ruleResult,
  };
}

function assertDecisionTrace({ scheme, files }) {
  assert(Boolean(scheme?.decisionTrace), 'acceptance/debug 模式缺少 decisionTrace');
  assert(scheme.decisionTrace.mode === 'acceptance', 'decisionTrace.mode 必须为 acceptance', scheme.decisionTrace);
  assert(Array.isArray(scheme.decisionTrace.entries), 'decisionTrace.entries 必须为数组');
  assert(
    scheme.decisionTrace.entries.length === files.length,
    'decisionTrace.entries 必须覆盖所有文件',
    { entryCount: scheme.decisionTrace.entries.length, fileCount: files.length }
  );

  const entryByFileId = new Map();
  for (const entry of scheme.decisionTrace.entries) {
    entryByFileId.set(entry.fileId, entry);
    assert(Boolean(entry.objectType), 'decisionTrace.objectType 缺失', entry);
    assert(Boolean(entry.semanticLayer), 'decisionTrace.semanticLayer 缺失', entry);
    assert(Boolean(entry.namingSource), 'decisionTrace.namingSource 缺失', entry);
    assert(Boolean(entry.executionAction), 'decisionTrace.executionAction 缺失', entry);
    assert(
      entry.objectType !== entry.semanticLayer,
      'objectType 与 semanticLayer 不应混用为同一字段',
      entry
    );
  }

  for (const file of files) {
    const entry = entryByFileId.get(file.fileId);
    assert(Boolean(entry), `decisionTrace 缺少文件条目: ${file.fileName}`);
  }
}

async function buildPlanContext(targetPath) {
  const { profile, files } = await profileService.buildDirectoryProfile({
    targetPath,
    sourceType: 'user_selected',
    watched: false,
  });

  const generated = await planningService.generateSchemes({
    profile,
    files,
    options: {
      debugDecisionTrace: true,
      decisionTraceMode: 'acceptance',
    },
  });

  const scheme = pickRecommendedScheme(generated);

  assert(Boolean(scheme), '未生成可用方案');
  for (const candidate of generated.schemes || []) {
    assertDecisionTrace({ scheme: candidate, files });
  }

  return {
    profile,
    files,
    generated,
    scheme,
  };
}

async function executeAndVerify({ targetPath, scheme, scannedCount, scenarioId }) {
  const rawLog = console.log;
  const rawWarn = console.warn;
  const rawError = console.error;
  console.log = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && /^\[\d{4}-\d{2}-\d{2}T/.test(first)) return;
    rawLog(...args);
  };
  console.warn = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && /^\[\d{4}-\d{2}-\d{2}T/.test(first)) return;
    rawWarn(...args);
  };
  console.error = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && /^\[\d{4}-\d{2}-\d{2}T/.test(first)) return;
    rawError(...args);
  };

  let executeResult;
  try {
    executeResult = await executionService.executeOrganizationScheme({
      taskId: `${scenarioId}-${Date.now()}`,
      targetPath,
      scheme,
      scannedCount,
    });
  } finally {
    console.log = rawLog;
    console.warn = rawWarn;
    console.error = rawError;
  }

  if (!executeResult.success) {
    return {
      executeResult,
      verificationReport: null,
    };
  }

  const verificationReport = await verificationService.verifyExecution({
    task: executeResult.task,
    receipt: executeResult.receipt,
  });

  return {
    executeResult,
    verificationReport,
  };
}

function formatErrors(errors = []) {
  return errors.slice(0, 3).map((err) => ({
    code: err.code || err.keyword || 'UNKNOWN',
    message: err.message || err.instancePath || 'unknown error',
    field: err.field || err.instancePath || '',
  }));
}

function logScenarioStart(name) {
  console.log(`\n[SCENARIO] ${name}`);
}

function logKeyValue(label, value) {
  console.log(`  - ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
}

async function scenarioNormalDirectory() {
  const name = '1.normal-directory';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, '运营周报_2026-04.xlsx'), 'sheet');
  await writeText(path.join(targetPath, '运营复盘_2026-03.docx'), 'doc');
  await writeText(path.join(targetPath, '运营海报_春季.png'), 'img');
  await writeText(path.join(targetPath, '运营ROI分析.pdf'), 'pdf');

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const { executeResult, verificationReport } = await executeAndVerify({
    targetPath,
    scheme: planCtx.scheme,
    scannedCount: planCtx.profile.scanStats.totalFiles,
    scenarioId: name,
  });

  assert(executeResult.success, 'execution 未执行成功', { error: executeResult.error });
  assert(verificationReport, '缺少 verification report');
  assert(verificationReport.summary.successCount > 0, 'verification successCount 应大于 0', verificationReport.summary);
  assert(
    verificationReport.summary.failedCount === 0,
    'normal 场景不应出现失败文件',
    verificationReport.failedFiles
  );

  const diskChecks = [];
  for (const item of verificationReport.successFiles) {
    const targetExists = await exists(item.targetPath);
    const sourceExists = await exists(item.sourcePath);
    diskChecks.push({
      fileName: item.fileName,
      targetExists,
      sourceExists,
    });
    assert(targetExists, `目标文件不存在: ${item.targetPath}`);
    assert(!sourceExists, `源文件仍存在: ${item.sourcePath}`);
  }

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('execution', {
    success: true,
    summary: executeResult.receipt.summary,
  });
  logKeyValue('verification', verificationReport.summary);
  logKeyValue('disk', {
    checkedSuccessFiles: diskChecks.length,
    sample: diskChecks.slice(0, 3),
  });

  return {
    name,
    passed: true,
    context: {
      verificationReport,
      targetPath,
    },
  };
}

async function scenarioProjectProtection() {
  const name = '2.project-protection';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, 'my-app/.git/config'), '[core]');
  await writeText(path.join(targetPath, 'my-app/package.json'), '{"name":"my-app"}');
  await writeText(path.join(targetPath, 'my-app/src/index.ts'), 'console.log("hello")');
  await writeText(path.join(targetPath, '客户合同_2026.docx'), 'contract');
  await writeText(path.join(targetPath, '客户报价清单.xlsx'), 'quote');
  await writeText(path.join(targetPath, '客户跟进记录.txt'), 'follow up');

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const protectedProject = (planCtx.profile.protectedItems || []).find((item) => item.path.endsWith('my-app'));
  assert(Boolean(protectedProject), '未检测到项目保护目录 my-app', planCtx.profile.protectedItems);

  const leakedMove = (planCtx.scheme.moves || []).find((move) =>
    move.sourcePath.startsWith(path.join(targetPath, 'my-app') + path.sep)
  );
  assert(!leakedMove, '发现项目目录内部文件被规划移动', leakedMove);

  const { executeResult, verificationReport } = await executeAndVerify({
    targetPath,
    scheme: planCtx.scheme,
    scannedCount: planCtx.profile.scanStats.totalFiles,
    scenarioId: name,
  });

  assert(executeResult.success, 'execution 未执行成功', { error: executeResult.error });
  assert(verificationReport, '缺少 verification report');

  const projectCoreStillExists = await exists(path.join(targetPath, 'my-app/src/index.ts'));
  assert(projectCoreStillExists, '项目文件应保持原位');

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
    protectedItems: planCtx.profile.protectedItems.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('execution', {
    success: true,
    summary: executeResult.receipt.summary,
  });
  logKeyValue('verification', verificationReport.summary);
  logKeyValue('disk', {
    protectedPath: path.join(targetPath, 'my-app/src/index.ts'),
    protectedFileStillExists: projectCoreStillExists,
  });

  return { name, passed: true };
}

async function scenarioInvalidPlanRejected() {
  const name = '3.invalid-plan-schema-reject';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, '运营日报_01.xlsx'));
  await writeText(path.join(targetPath, '运营日报_02.docx'));

  const planCtx = await buildPlanContext(targetPath);
  const invalidScheme = clone(planCtx.scheme);
  const targetMove = invalidScheme.moves.find((move) => move.statusHint === 'planned');
  assert(targetMove, '未找到可用于造坏数据的 planned move');
  delete targetMove.fileId;

  const gate = evaluateGate({
    scheme: invalidScheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(!gate.passed, '非法 plan 应被 gate 拒绝');
  const schemaCodes = (gate.schemaResult.errors || []).map((item) => item.keyword);
  const ruleCodes = (gate.ruleResult.errors || []).map((item) => item.code);
  assert(schemaCodes.includes('required'), 'schema 未拦截 required 缺失', gate.schemaResult.errors);
  assert(ruleCodes.includes('MOVE_IDENTITY_REQUIRED'), '规则层未拦截 fileId/sourcePath 约束', gate.ruleResult.errors);

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
  });
  logKeyValue('plan', summarizePlan(invalidScheme));
  logKeyValue('gate', {
    passed: false,
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });
  logKeyValue('execution', { executed: false });
  logKeyValue('verification', { generated: false });
  logKeyValue('disk', { changed: false });

  return { name, passed: true };
}

async function scenarioTargetEscapeRejected() {
  const name = '4.targetpath-escape-reject';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, '运营月报_04.xlsx'));
  await writeText(path.join(targetPath, '运营分析_04.docx'));

  const planCtx = await buildPlanContext(targetPath);
  const invalidScheme = clone(planCtx.scheme);
  const targetMove = invalidScheme.moves.find((move) => move.statusHint === 'planned');
  assert(targetMove, '未找到可用于路径逃逸测试的 planned move');
  targetMove.targetPath = path.join(os.tmpdir(), 'escape-outside-root.txt');

  const gate = evaluateGate({
    scheme: invalidScheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(!gate.passed, '越界 targetPath 应被 gate 拒绝');
  const ruleCodes = (gate.ruleResult.errors || []).map((item) => item.code);
  assert(ruleCodes.includes('MOVE_TARGET_MISMATCH'), '未命中 MOVE_TARGET_MISMATCH', gate.ruleResult.errors);
  assert(ruleCodes.includes('MOVE_TARGET_ESCAPE'), '未命中 MOVE_TARGET_ESCAPE', gate.ruleResult.errors);

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
  });
  logKeyValue('plan', summarizePlan(invalidScheme));
  logKeyValue('gate', {
    passed: false,
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });
  logKeyValue('execution', { executed: false });
  logKeyValue('verification', { generated: false });
  logKeyValue('disk', { changed: false });

  return { name, passed: true };
}

async function scenarioVeryLowUncertain() {
  const name = '5.very-low-uncertain';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, 'a1.tmp'));
  await writeText(path.join(targetPath, 'b2.bin'));
  await writeText(path.join(targetPath, 'c3.dat'));
  await writeText(path.join(targetPath, 'd4.log'));

  const planCtx = await buildPlanContext(targetPath);
  const scheme = planCtx.scheme;
  const gate = evaluateGate({
    scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });
  assert(scheme.confidenceLevel === 'very_low', '场景 5 未进入 very_low', summarizePlan(scheme));
  assert(plannedMoveCount(scheme) === 0, 'very_low 场景不应自动移动', summarizePlan(scheme));
  assert(
    (scheme.uncertainFiles || []).length === planCtx.profile.scanStats.estimatedMovableFiles,
    'very_low 场景 uncertainFiles 数量不匹配',
    {
      uncertain: (scheme.uncertainFiles || []).length,
      movable: planCtx.profile.scanStats.estimatedMovableFiles,
    }
  );

  const { executeResult, verificationReport } = await executeAndVerify({
    targetPath,
    scheme,
    scannedCount: planCtx.profile.scanStats.totalFiles,
    scenarioId: name,
  });

  assert(executeResult.success, 'execution 未执行成功', { error: executeResult.error });
  assert(verificationReport, '缺少 verification report');
  assert(verificationReport.summary.successCount === 0, 'very_low 场景不应有 success', verificationReport.summary);
  assert(verificationReport.summary.failedCount === 0, 'very_low 场景不应有 failed', verificationReport.summary);
  assert(
    verificationReport.summary.skippedCount === scheme.uncertainFiles.length,
    'very_low 场景 skippedCount 应等于 uncertainFiles',
    {
      skipped: verificationReport.summary.skippedCount,
      uncertain: scheme.uncertainFiles.length,
    }
  );
  assert(verificationReport.createdFolders.length === 0, 'very_low 场景不应创建目录骨架', verificationReport.createdFolders);

  for (const uncertain of scheme.uncertainFiles) {
    const stillExists = await exists(uncertain.sourcePath);
    assert(stillExists, `待确认文件应保留原位: ${uncertain.sourcePath}`);
  }

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
  });
  logKeyValue('plan', summarizePlan(scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('execution', {
    success: true,
    summary: executeResult.receipt.summary,
  });
  logKeyValue('verification', verificationReport.summary);
  logKeyValue('disk', {
    uncertainStayedInPlace: true,
    createdFolders: verificationReport.createdFolders.length,
  });

  return { name, passed: true };
}

async function scenarioResultPathConsistency(referenceScenarioContext) {
  const name = '6.result-page-real-verification-consistency';
  logScenarioStart(name);

  assert(referenceScenarioContext?.verificationReport, '缺少场景 1 的 verification report 上下文');
  const report = referenceScenarioContext.verificationReport;

  for (const item of report.successFiles) {
    const realPath = await fsp.realpath(item.targetPath);
    const parentRealPath = await fsp.realpath(path.dirname(item.targetPath));
    const canonicalDisplayPath = path.join(parentRealPath, path.basename(item.targetPath));
    assert(
      path.resolve(realPath) === path.resolve(canonicalDisplayPath),
      '展示路径与磁盘真实路径不一致',
      { display: item.targetPath, realPath }
    );
  }

  const resultPagePath = path.join(REPO_ROOT, 'src/renderer/pages/ResultPage.tsx');
  const resultPageCode = await fsp.readFile(resultPagePath, 'utf8');

  assert(
    resultPageCode.includes('verificationReport.successFiles') &&
      resultPageCode.includes('verificationReport.failedFiles') &&
      resultPageCode.includes('verificationReport.skippedFiles'),
    'ResultPage 未消费 verificationReport 三类结果'
  );

  assert(
    !resultPageCode.includes('adjustedScheme') && !resultPageCode.includes('selectedScheme'),
    'ResultPage 仍引用方案数据，可能绕过真实验证结果'
  );
  assert(
    resultPageCode.includes('sceneCategory') &&
      resultPageCode.includes('sceneConfidence') &&
      resultPageCode.includes('sceneEvidence'),
    'ResultPage 未展示场景解释字段'
  );

  logKeyValue('input', {
    sourceScenario: referenceScenarioContext.targetPath,
    successFiles: report.successFiles.length,
  });
  logKeyValue('plan', { note: 'result-page checks' });
  logKeyValue('gate', { note: 'reuse scenario-1 gate result' });
  logKeyValue('execution', { source: 'scenario-1 execution receipt' });
  logKeyValue('verification', report.summary);
  logKeyValue('disk', {
    pathConsistencyChecked: report.successFiles.length,
    resultPageUsesVerificationReport: true,
  });

  return { name, passed: true };
}

async function scenarioDuplicateFilenameCollision() {
  const name = '7.duplicate-filename-collision';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, 'from-a', '运营日报.pdf'), 'content-a');
  await writeText(path.join(targetPath, 'from-b', '运营日报.pdf'), 'content-b');
  await writeText(path.join(targetPath, '运营总览.xlsx'), 'table');

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const { executeResult, verificationReport } = await executeAndVerify({
    targetPath,
    scheme: planCtx.scheme,
    scannedCount: planCtx.profile.scanStats.totalFiles,
    scenarioId: name,
  });

  assert(executeResult.success, 'execution 未执行成功', { error: executeResult.error });
  assert(verificationReport, '缺少 verification report');

  const sameNameSuccess = verificationReport.successFiles.filter((item) => item.fileName === '运营日报.pdf');
  assert(sameNameSuccess.length === 2, '应有 2 个同名文件成功记录', sameNameSuccess);

  const targetSet = new Set(sameNameSuccess.map((item) => item.targetPath));
  assert(targetSet.size === 2, '同名文件目标路径应不同（含重名后缀）', sameNameSuccess);
  assert(
    Array.from(targetSet).some((item) => /\(\d+\)\.pdf$/.test(item)),
    '至少一个同名文件应被自动重命名',
    sameNameSuccess
  );

  for (const target of targetSet) {
    assert(await exists(target), `重名处理后目标文件不存在: ${target}`);
  }

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('execution', {
    success: true,
    summary: executeResult.receipt.summary,
  });
  logKeyValue('verification', verificationReport.summary);
  logKeyValue('disk', {
    sameNameSuccess: sameNameSuccess.length,
    distinctTargets: targetSet.size,
    sampleTargets: Array.from(targetSet),
  });

  return { name, passed: true };
}

async function scenarioProjectContainerWithLooseFiles() {
  const name = '8.project-container-with-loose-files';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, 'projects', 'my-app', '.git', 'config'), '[core]');
  await writeText(path.join(targetPath, 'projects', 'my-app', 'package.json'), '{"name":"my-app"}');
  await writeText(path.join(targetPath, 'projects', 'my-app', 'src', 'main.ts'), 'console.log("app")');
  await writeText(path.join(targetPath, '调研周报_春季.pdf'), 'research');
  await writeText(path.join(targetPath, '学习笔记_产品.docx'), 'notes');
  await writeText(path.join(targetPath, '客户名单_4月.xlsx'), 'customers');

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const protectedProject = (planCtx.profile.protectedItems || []).find((item) =>
    item.path.endsWith(path.join('projects', 'my-app'))
  );
  assert(Boolean(protectedProject), '未检测到项目容器内的项目根保护', planCtx.profile.protectedItems);

  const leakedMove = (planCtx.scheme.moves || []).find((move) =>
    move.sourcePath.startsWith(path.join(targetPath, 'projects', 'my-app') + path.sep)
  );
  assert(!leakedMove, '项目容器内部文件不应被计划移动', leakedMove);

  const { executeResult, verificationReport } = await executeAndVerify({
    targetPath,
    scheme: planCtx.scheme,
    scannedCount: planCtx.profile.scanStats.totalFiles,
    scenarioId: name,
  });

  assert(executeResult.success, 'execution 未执行成功', { error: executeResult.error });
  assert(verificationReport, '缺少 verification report');
  assert(verificationReport.summary.successCount >= 2, '散文件应至少有 2 个成功移动', verificationReport.summary);

  const appCoreStillExists = await exists(path.join(targetPath, 'projects', 'my-app', 'src', 'main.ts'));
  assert(appCoreStillExists, '项目容器内文件应保持原位');

  logKeyValue('input', {
    targetPath,
    totalFiles: planCtx.profile.scanStats.totalFiles,
    protectedItems: planCtx.profile.protectedItems.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('execution', {
    success: true,
    summary: executeResult.receipt.summary,
  });
  logKeyValue('verification', verificationReport.summary);
  logKeyValue('disk', {
    protectedFileStillExists: appCoreStillExists,
    looseFileSuccessCount: verificationReport.summary.successCount,
  });

  return { name, passed: true };
}

async function scenarioSceneCategoryHitMatrix() {
  const name = '9.scene-category-hit-matrix';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  for (const sceneCase of SCENE_ACCEPTANCE_CASES) {
    const dirName = `${sceneCase.category}-样本`;
    await writeText(path.join(targetPath, dirName, sceneCase.fileName), `scene=${sceneCase.category}`);
  }

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const moveByFileName = buildDecisionIndexByFileName(planCtx.scheme);
  let matchedCount = 0;
  const mismatches = [];

  for (const sceneCase of SCENE_ACCEPTANCE_CASES) {
    const move = moveByFileName.get(sceneCase.fileName);
    assert(move, `未找到场景样本 move: ${sceneCase.fileName}`);
    const matched = move.sceneCategory === sceneCase.category;
    if (matched) matchedCount += 1;
    if (!matched) {
      mismatches.push({
        fileName: sceneCase.fileName,
        expected: sceneCase.category,
        actual: move.sceneCategory,
      });
    }
  }

  const hitRate = matchedCount / SCENE_ACCEPTANCE_CASES.length;
  assert(hitRate >= 0.9, '16 场景命中率过低', { hitRate, mismatches });

  logKeyValue('input', {
    targetPath,
    sceneCases: SCENE_ACCEPTANCE_CASES.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('sceneHit', {
    matchedCount,
    total: SCENE_ACCEPTANCE_CASES.length,
    hitRate: Number(hitRate.toFixed(4)),
    mismatches,
  });

  return {
    name,
    passed: true,
    context: {
      targetPath,
      moveByFileName: Object.fromEntries(moveByFileName),
      sceneHitRate: hitRate,
    },
  };
}

async function scenarioSceneTierBDowngrade() {
  const name = '10.scene-tier-b-downgrade';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  // 仅弱信号，B 级场景应降级，不应直接命中场景
  await writeText(path.join(targetPath, '需求草稿.pdf'), 'weak-demand');
  await writeText(path.join(targetPath, '培训记录.docx'), 'weak-training');
  await writeText(path.join(targetPath, '资料汇总.pdf'), 'generic');

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const weakNames = new Set(['需求草稿.pdf', '培训记录.docx']);
  const weakMoves = (planCtx.scheme.moves || []).filter((move) => weakNames.has(move.fileName));
  assert(weakMoves.length === 2, '未找到弱信号样本 move', weakMoves);

  for (const move of weakMoves) {
    assert(move.sceneCategory === null, 'B级弱证据样本不应命中场景', move);
  }

  logKeyValue('input', {
    targetPath,
    weakSamples: Array.from(weakNames),
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('downgrade', {
    checked: weakMoves.length,
    allDowngraded: true,
  });

  return { name, passed: true };
}

async function scenarioSceneMetricsImprovement(sceneContext) {
  const name = '11.scene-metrics-improvement';
  logScenarioStart(name);

  assert(sceneContext?.targetPath, '缺少场景命中矩阵上下文');
  const targetPath = sceneContext.targetPath;

  const planCtx = await buildPlanContext(targetPath);
  const scheme = planCtx.scheme;

  const moveByFileName = new Map((scheme.moves || []).map((move) => [move.fileName, move]));
  let baselineHit = 0;
  let currentHit = 0;
  let baselineDocFallback = 0;
  let currentDocFallback = 0;
  let docCandidates = 0;

  for (const sceneCase of SCENE_ACCEPTANCE_CASES) {
    const ext = extName(sceneCase.fileName);
    const baselineCategory = baselineSceneCategory(sceneCase.fileName);
    const move = moveByFileName.get(sceneCase.fileName);
    assert(move, `metrics 缺少 move: ${sceneCase.fileName}`);

    if (baselineCategory === sceneCase.category) baselineHit += 1;
    if (move.sceneCategory === sceneCase.category) currentHit += 1;

    if (DOC_EXTENSIONS.has(ext)) {
      docCandidates += 1;
      if (!baselineCategory) baselineDocFallback += 1;
      if (path.basename(path.dirname(move.targetPath)) === '文档') currentDocFallback += 1;
    }
  }

  const total = SCENE_ACCEPTANCE_CASES.length;
  const baselineSceneHitRate = baselineHit / total;
  const currentSceneHitRate = currentHit / total;
  const baselineDocFallbackRatio = baselineDocFallback / Math.max(1, docCandidates);
  const currentDocFallbackRatio = currentDocFallback / Math.max(1, docCandidates);
  const baselineManualReclassRate = 1 - baselineSceneHitRate;
  const currentManualReclassRate = 1 - currentSceneHitRate;
  const baselineFirstPassAcceptRate = 1 - baselineManualReclassRate;
  const currentFirstPassAcceptRate = 1 - currentManualReclassRate;

  assert(currentSceneHitRate > baselineSceneHitRate, '场景命中率未提升', {
    baselineSceneHitRate,
    currentSceneHitRate,
  });
  assert(currentDocFallbackRatio < baselineDocFallbackRatio, '文档兜底占比未下降', {
    baselineDocFallbackRatio,
    currentDocFallbackRatio,
  });
  assert(currentManualReclassRate < baselineManualReclassRate, '手动改分类率未下降', {
    baselineManualReclassRate,
    currentManualReclassRate,
  });
  assert(currentFirstPassAcceptRate > baselineFirstPassAcceptRate, '首次确认通过率未提升', {
    baselineFirstPassAcceptRate,
    currentFirstPassAcceptRate,
  });

  logKeyValue('input', {
    targetPath,
    total,
    docCandidates,
    sceneTaxonomySize: sceneTaxonomy.categories.length,
  });
  logKeyValue('metrics', {
    sceneHitRate: {
      baseline: Number(baselineSceneHitRate.toFixed(4)),
      current: Number(currentSceneHitRate.toFixed(4)),
    },
    documentFallbackRatio: {
      baseline: Number(baselineDocFallbackRatio.toFixed(4)),
      current: Number(currentDocFallbackRatio.toFixed(4)),
    },
    manualReclassRate: {
      baseline: Number(baselineManualReclassRate.toFixed(4)),
      current: Number(currentManualReclassRate.toFixed(4)),
    },
    firstPassAcceptRate: {
      baseline: Number(baselineFirstPassAcceptRate.toFixed(4)),
      current: Number(currentFirstPassAcceptRate.toFixed(4)),
    },
  });

  return { name, passed: true };
}

async function scenarioSceneFalsePositiveGuard() {
  const name = '12.scene-false-positive-guard';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  for (const [index, sample] of SCENE_FALSE_POSITIVE_CASES.entries()) {
    const bucket = `misc-${(index % 3) + 1}`;
    await writeText(path.join(targetPath, bucket, sample.fileName), `negative=${sample.fileName}`);
  }

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const moveByFileName = buildDecisionIndexByFileName(planCtx.scheme);
  const falsePositives = [];

  for (const sample of SCENE_FALSE_POSITIVE_CASES) {
    const move = moveByFileName.get(sample.fileName);
    assert(move, `未找到误命中样本 move: ${sample.fileName}`);
    if (move.sceneCategory) {
      falsePositives.push({
        fileName: sample.fileName,
        predicted: move.sceneCategory,
        confidence: move.sceneConfidence,
      });
    }
  }

  const falsePositiveRate = falsePositives.length / SCENE_FALSE_POSITIVE_CASES.length;
  assert(falsePositiveRate <= 0.15, '误命中率超阈值', {
    falsePositiveRate,
    falsePositives,
  });

  logKeyValue('input', {
    targetPath,
    negativeSamples: SCENE_FALSE_POSITIVE_CASES.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('falsePositive', {
    total: SCENE_FALSE_POSITIVE_CASES.length,
    count: falsePositives.length,
    rate: Number(falsePositiveRate.toFixed(4)),
    sample: falsePositives.slice(0, 5),
  });

  return { name, passed: true };
}

async function scenarioSceneMetricsMixedRealWorld() {
  const name = '13.scene-metrics-mixed-real-world';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  // 混杂真实样本：散文件 + 项目容器 + 场景样本 + 模糊样本
  await writeText(path.join(targetPath, 'workspace', 'my-app', '.git', 'config'), '[core]');
  await writeText(path.join(targetPath, 'workspace', 'my-app', 'package.json'), '{"name":"my-app"}');
  await writeText(path.join(targetPath, 'workspace', 'my-app', 'src', 'index.ts'), 'console.log("keep")');

  for (const sample of SCENE_MIXED_REAL_CASES) {
    await writeText(path.join(targetPath, 'mixed-bin', sample.fileName), `mixed=${sample.expectedScene || 'none'}`);
  }

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const moveByFileName = new Map((planCtx.scheme.moves || []).map((move) => [move.fileName, move]));
  let baselineMatchCount = 0;
  let currentMatchCount = 0;
  let baselineFallbackDocs = 0;
  let currentFallbackDocs = 0;
  let docCandidates = 0;
  let baselineManualReclass = 0;
  let currentManualReclass = 0;
  let negativeTotal = 0;
  let currentFalsePositive = 0;
  const mismatches = [];

  for (const sample of SCENE_MIXED_REAL_CASES) {
    const move = moveByFileName.get(sample.fileName);
    assert(move, `mixed 样本缺少 move: ${sample.fileName}`);

    const baselineCategory = baselineSceneCategory(sample.fileName);
    const currentCategory = Object.prototype.hasOwnProperty.call(move, 'sceneCategory') ? move.sceneCategory : null;

    if (baselineCategory === sample.expectedScene) baselineMatchCount += 1;
    if (currentCategory === sample.expectedScene) currentMatchCount += 1;

    if (baselineCategory !== sample.expectedScene) baselineManualReclass += 1;
    if (currentCategory !== sample.expectedScene) currentManualReclass += 1;

    if (sample.expectedScene === null) {
      negativeTotal += 1;
      if (currentCategory) currentFalsePositive += 1;
    }

    const ext = extName(sample.fileName);
    if (DOC_EXTENSIONS.has(ext)) {
      docCandidates += 1;
      if (!baselineCategory) baselineFallbackDocs += 1;
      if (!currentCategory) currentFallbackDocs += 1;
    }

    if (currentCategory !== sample.expectedScene) {
      mismatches.push({
        fileName: sample.fileName,
        expected: sample.expectedScene,
        actual: currentCategory,
      });
    }
  }

  const total = SCENE_MIXED_REAL_CASES.length;
  const baselineSceneHitRate = baselineMatchCount / total;
  const currentSceneHitRate = currentMatchCount / total;
  const baselineDocFallbackRatio = baselineFallbackDocs / Math.max(1, docCandidates);
  const currentDocFallbackRatio = currentFallbackDocs / Math.max(1, docCandidates);
  const baselineManualReclassRate = baselineManualReclass / total;
  const currentManualReclassRate = currentManualReclass / total;
  const baselineFirstPassAcceptRate = 1 - baselineManualReclassRate;
  const currentFirstPassAcceptRate = 1 - currentManualReclassRate;
  const currentFalsePositiveRate = currentFalsePositive / Math.max(1, negativeTotal);

  assert(currentSceneHitRate > baselineSceneHitRate, '混杂样本命中率未提升', {
    baselineSceneHitRate,
    currentSceneHitRate,
    mismatches,
  });
  assert(currentDocFallbackRatio < baselineDocFallbackRatio, '混杂样本文档兜底占比未下降', {
    baselineDocFallbackRatio,
    currentDocFallbackRatio,
  });
  assert(currentManualReclassRate < baselineManualReclassRate, '混杂样本手动改分类率未下降', {
    baselineManualReclassRate,
    currentManualReclassRate,
  });
  assert(currentFirstPassAcceptRate > baselineFirstPassAcceptRate, '混杂样本首次确认通过率未提升', {
    baselineFirstPassAcceptRate,
    currentFirstPassAcceptRate,
  });
  assert(currentFalsePositiveRate <= 0.34, '混杂样本误命中率过高', {
    currentFalsePositiveRate,
    negativeTotal,
    currentFalsePositive,
    mismatches,
  });

  const protectedCore = await exists(path.join(targetPath, 'workspace', 'my-app', 'src', 'index.ts'));
  assert(protectedCore, '混杂样本中项目容器文件应保持原位');

  logKeyValue('input', {
    targetPath,
    total,
    docCandidates,
    negativeTotal,
    protectedItems: planCtx.profile.protectedItems.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('metrics', {
    sceneHitRate: {
      baseline: Number(baselineSceneHitRate.toFixed(4)),
      current: Number(currentSceneHitRate.toFixed(4)),
    },
    documentFallbackRatio: {
      baseline: Number(baselineDocFallbackRatio.toFixed(4)),
      current: Number(currentDocFallbackRatio.toFixed(4)),
    },
    manualReclassRate: {
      baseline: Number(baselineManualReclassRate.toFixed(4)),
      current: Number(currentManualReclassRate.toFixed(4)),
    },
    firstPassAcceptRate: {
      baseline: Number(baselineFirstPassAcceptRate.toFixed(4)),
      current: Number(currentFirstPassAcceptRate.toFixed(4)),
    },
    falsePositiveRate: Number(currentFalsePositiveRate.toFixed(4)),
    mismatchSample: mismatches.slice(0, 6),
  });
  logKeyValue('disk', {
    protectedFileStillExists: protectedCore,
  });

  return { name, passed: true };
}

async function scenarioResumeStrongPriority() {
  const name = '14.resume-strong-priority';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  for (const fileName of RESUME_PRIORITY_POSITIVE_CASES) {
    await writeText(path.join(targetPath, 'positive', fileName), 'resume-positive');
  }
  for (const fileName of RESUME_PRIORITY_NEGATIVE_CASES) {
    await writeText(path.join(targetPath, 'negative', fileName), 'resume-negative');
  }

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const moveByFileName = new Map((planCtx.scheme.moves || []).map((move) => [move.fileName, move]));
  const traceByFileName = new Map(
    ((planCtx.scheme.decisionTrace?.entries || [])).map((entry) => [entry.fileName, entry])
  );

  const positiveTrace = [];
  for (const fileName of RESUME_PRIORITY_POSITIVE_CASES) {
    const move = moveByFileName.get(fileName);
    const trace = traceByFileName.get(fileName);
    assert(move, `缺少正例 move: ${fileName}`);
    assert(trace, `缺少正例 decisionTrace: ${fileName}`);
    assert(move.sceneCategory === '简历', '正例必须命中简历场景', { fileName, move });
    assert(trace.objectType === 'scenario_object', '正例 objectType 必须为 scenario_object', { fileName, trace });
    assert(trace.semanticLayer === 'scenario', '正例 semanticLayer 必须为 scenario', { fileName, trace });
    assert(trace.namingSource === 'scenario', '正例 namingSource 必须为 scenario', { fileName, trace });
    assert(trace.executionAction === 'move', '正例 executionAction 必须为 move', { fileName, trace });
    const parentName = path.basename(path.dirname(move.targetPath));
    assert(parentName === '简历', '正例最终目录必须进入简历', { fileName, targetPath: move.targetPath });

    positiveTrace.push({
      fileName,
      objectType: trace.objectType,
      semanticLayer: trace.semanticLayer,
      namingSource: trace.namingSource,
      executionAction: trace.executionAction,
      targetPath: move.targetPath,
    });
  }

  const negativeTrace = [];
  for (const fileName of RESUME_PRIORITY_NEGATIVE_CASES) {
    const move = moveByFileName.get(fileName);
    const trace = traceByFileName.get(fileName);
    assert(move, `缺少反例 move: ${fileName}`);
    assert(trace, `缺少反例 decisionTrace: ${fileName}`);
    assert(move.sceneCategory !== '简历', '反例不得误判为简历', { fileName, move });
    assert(!(trace.objectType === 'scenario_object' && trace.semanticLayer === 'scenario' && trace.namingSource === 'scenario'),
      '反例不得被作为场景优先简历处理',
      { fileName, trace }
    );

    negativeTrace.push({
      fileName,
      sceneCategory: move.sceneCategory || null,
      objectType: trace.objectType,
      semanticLayer: trace.semanticLayer,
      namingSource: trace.namingSource,
    });
  }

  logKeyValue('input', {
    targetPath,
    positives: RESUME_PRIORITY_POSITIVE_CASES,
    negatives: RESUME_PRIORITY_NEGATIVE_CASES,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('resumePriority', {
    positiveCount: RESUME_PRIORITY_POSITIVE_CASES.length,
    negativeCount: RESUME_PRIORITY_NEGATIVE_CASES.length,
    positiveTrace,
    negativeTrace,
  });

  return {
    name,
    passed: true,
    context: {
      targetPath,
      positiveTrace,
      negativeTrace,
    },
  };
}

async function scenarioStrongScenePriorityBaseline() {
  const name = '15.strong-scene-priority-baseline';
  logScenarioStart(name);

  const targetPath = path.join(ACCEPTANCE_ROOT, name, 'input');
  await resetDir(targetPath);

  for (const sceneCase of STRONG_SCENE_PRIORITY_CASES) {
    await writeText(path.join(targetPath, 'positive', sceneCase.positiveFile), `positive=${sceneCase.sceneCategory}`);
    await writeText(path.join(targetPath, 'negative', sceneCase.negativeFile), `negative=${sceneCase.sceneCategory}`);
  }

  const planCtx = await buildPlanContext(targetPath);
  const gate = evaluateGate({
    scheme: planCtx.scheme,
    profile: planCtx.profile,
    files: planCtx.files,
    targetRoot: targetPath,
  });

  assert(gate.passed, 'gate 未通过', {
    schemaErrors: formatErrors(gate.schemaResult.errors),
    ruleErrors: formatErrors(gate.ruleResult.errors),
  });

  const moveByFileName = new Map((planCtx.scheme.moves || []).map((move) => [move.fileName, move]));
  const traceByFileName = new Map(
    ((planCtx.scheme.decisionTrace?.entries || [])).map((entry) => [entry.fileName, entry])
  );

  const classResults = [];

  for (const sceneCase of STRONG_SCENE_PRIORITY_CASES) {
    const posMove = moveByFileName.get(sceneCase.positiveFile);
    const posTrace = traceByFileName.get(sceneCase.positiveFile);
    assert(posMove, `缺少强场景正例 move: ${sceneCase.positiveFile}`);
    assert(posTrace, `缺少强场景正例 trace: ${sceneCase.positiveFile}`);
    assert(posMove.sceneCategory === sceneCase.sceneCategory, '强场景正例必须命中对应场景', {
      scene: sceneCase.sceneCategory,
      fileName: sceneCase.positiveFile,
      move: posMove,
    });
    assert(posTrace.objectType === 'scenario_object', '强场景正例 objectType 必须为 scenario_object', {
      scene: sceneCase.sceneCategory,
      trace: posTrace,
    });
    assert(posTrace.semanticLayer === 'scenario', '强场景正例 semanticLayer 必须为 scenario', {
      scene: sceneCase.sceneCategory,
      trace: posTrace,
    });
    assert(posTrace.namingSource === 'scenario', '强场景正例 namingSource 必须为 scenario', {
      scene: sceneCase.sceneCategory,
      trace: posTrace,
    });
    const posParent = path.basename(path.dirname(posMove.targetPath));
    assert(posParent === sceneCase.sceneCategory, '强场景正例必须进入对应目录', {
      scene: sceneCase.sceneCategory,
      fileName: sceneCase.positiveFile,
      targetPath: posMove.targetPath,
    });

    const negMove = moveByFileName.get(sceneCase.negativeFile);
    const negTrace = traceByFileName.get(sceneCase.negativeFile);
    assert(negMove, `缺少强场景反例 move: ${sceneCase.negativeFile}`);
    assert(negTrace, `缺少强场景反例 trace: ${sceneCase.negativeFile}`);
    assert(negMove.sceneCategory !== sceneCase.sceneCategory, '强场景反例不得误命中对应场景', {
      scene: sceneCase.sceneCategory,
      fileName: sceneCase.negativeFile,
      move: negMove,
    });

    classResults.push({
      sceneCategory: sceneCase.sceneCategory,
      positive: {
        fileName: sceneCase.positiveFile,
        trace: posTrace,
        move: {
          sceneCategory: posMove.sceneCategory || null,
          reason: posMove.reason,
          targetPath: posMove.targetPath,
          statusHint: posMove.statusHint,
        },
      },
      negative: {
        fileName: sceneCase.negativeFile,
        trace: negTrace,
        move: {
          sceneCategory: negMove.sceneCategory || null,
          reason: negMove.reason,
          targetPath: negMove.targetPath,
          statusHint: negMove.statusHint,
        },
      },
    });
  }

  logKeyValue('input', {
    targetPath,
    strongSceneCount: STRONG_SCENE_PRIORITY_CASES.length,
  });
  logKeyValue('plan', summarizePlan(planCtx.scheme));
  logKeyValue('gate', { passed: true });
  logKeyValue('strongSceneBaseline', classResults);

  return {
    name,
    passed: true,
    context: {
      classResults,
    },
  };
}

async function runScenario(fn, sharedContext = {}) {
  try {
    const output = await fn(sharedContext);
    console.log(`  => RESULT: PASS`);
    return { ...output, passed: true };
  } catch (error) {
    console.log(`  => RESULT: FAIL`);
    logKeyValue('error', error.message);
    if (error.details) {
      logKeyValue('debug', error.details);
    }
    return { name: fn.name, passed: false, error };
  }
}

async function main() {
  await ensureDir(ACCEPTANCE_HOME);
  await resetDir(ACCEPTANCE_ROOT);

  console.log('[Phase1 Acceptance] Start');
  console.log(`[Phase1 Acceptance] root=${ACCEPTANCE_ROOT}`);

  const results = [];

  const scenario1 = await runScenario(scenarioNormalDirectory);
  results.push(scenario1);

  const scenario2 = await runScenario(scenarioProjectProtection);
  results.push(scenario2);

  const scenario3 = await runScenario(scenarioInvalidPlanRejected);
  results.push(scenario3);

  const scenario4 = await runScenario(scenarioTargetEscapeRejected);
  results.push(scenario4);

  const scenario5 = await runScenario(scenarioVeryLowUncertain);
  results.push(scenario5);

  const scenario6 = await runScenario(() => scenarioResultPathConsistency(scenario1.context));
  results.push(scenario6);

  const scenario7 = await runScenario(scenarioDuplicateFilenameCollision);
  results.push(scenario7);

  const scenario8 = await runScenario(scenarioProjectContainerWithLooseFiles);
  results.push(scenario8);

  const scenario9 = await runScenario(scenarioSceneCategoryHitMatrix);
  results.push(scenario9);

  const scenario10 = await runScenario(scenarioSceneTierBDowngrade);
  results.push(scenario10);

  const scenario11 = await runScenario(() => scenarioSceneMetricsImprovement(scenario9.context));
  results.push(scenario11);

  const scenario12 = await runScenario(scenarioSceneFalsePositiveGuard);
  results.push(scenario12);

  const scenario13 = await runScenario(scenarioSceneMetricsMixedRealWorld);
  results.push(scenario13);

  const scenario14 = await runScenario(scenarioResumeStrongPriority);
  results.push(scenario14);

  const scenario15 = await runScenario(scenarioStrongScenePriorityBaseline);
  results.push(scenario15);

  const passed = results.filter((item) => item.passed).length;
  const failed = results.length - passed;
  console.log('\n[Phase1 Acceptance] Summary');
  console.log(`  - passed: ${passed}`);
  console.log(`  - failed: ${failed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[Phase1 Acceptance] Fatal error:', error);
  process.exitCode = 1;
});
