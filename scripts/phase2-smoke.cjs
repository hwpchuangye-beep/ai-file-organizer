#!/usr/bin/env node

const path = require('path');
const os = require('os');
const fsp = require('fs').promises;

const REPO_ROOT = path.resolve(__dirname, '..');
const SMOKE_ROOT = path.join(os.tmpdir(), 'ai-file-organizer-phase2-smoke');
const SMOKE_HOME = path.join(os.tmpdir(), 'ai-file-organizer-phase2-home');

process.env.HOME = SMOKE_HOME;

const profileService = require(path.join(REPO_ROOT, 'src/main/services/profileService.cjs'));
const planningService = require(path.join(REPO_ROOT, 'src/main/services/planningService.cjs'));
const executionService = require(path.join(REPO_ROOT, 'src/main/services/executionService.cjs'));
const verificationService = require(path.join(REPO_ROOT, 'src/main/services/verificationService.cjs'));

function assert(condition, message, details) {
  if (!condition) {
    const err = new Error(message);
    err.details = details;
    throw err;
  }
}

async function resetDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
  await fsp.mkdir(dirPath, { recursive: true });
}

async function writeText(filePath, content = 'phase2-smoke-file') {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

function summarize(result) {
  return {
    status: result.task?.status,
    planned: result.receipt?.summary?.plannedCount,
    executed: result.receipt?.summary?.executedCount,
    success: result.receipt?.summary?.successCount,
    failed: result.receipt?.summary?.failedCount,
    skipped: result.receipt?.summary?.skippedCount,
    batchInfo: result.task?.batchInfo || null,
    paused: Boolean(result.paused),
    hasRemaining: Boolean(result.hasRemaining),
  };
}

async function runMutedExecution(work) {
  const rawLog = console.log;
  const rawWarn = console.warn;
  const rawError = console.error;

  const isExecutionLog = (value) => typeof value === 'string' && /^\[\d{4}-\d{2}-\d{2}T/.test(value);

  console.log = (...args) => {
    if (isExecutionLog(args[0])) return;
    rawLog(...args);
  };
  console.warn = (...args) => {
    if (isExecutionLog(args[0])) return;
    rawWarn(...args);
  };
  console.error = (...args) => {
    if (isExecutionLog(args[0])) return;
    rawError(...args);
  };

  try {
    return await work();
  } finally {
    console.log = rawLog;
    console.warn = rawWarn;
    console.error = rawError;
  }
}

async function main() {
  await fsp.mkdir(SMOKE_HOME, { recursive: true });
  await resetDir(SMOKE_ROOT);

  const targetPath = path.join(SMOKE_ROOT, 'input');
  await resetDir(targetPath);

  await writeText(path.join(targetPath, '运营日报_1.xlsx'));
  await writeText(path.join(targetPath, '运营日报_2.xlsx'));
  await writeText(path.join(targetPath, '运营复盘_1.docx'));
  await writeText(path.join(targetPath, '运营复盘_2.docx'));
  await writeText(path.join(targetPath, '运营素材_1.png'));
  await writeText(path.join(targetPath, '运营素材_2.png'));

  const { profile, files } = await profileService.buildDirectoryProfile({
    targetPath,
    sourceType: 'user_selected',
    watched: false,
  });
  const generated = await planningService.generateSchemes({ profile, files });
  const scheme =
    generated.schemes.find((item) => item.schemeId === generated.recommendedSchemeId) ||
    generated.schemes[0];

  assert(scheme, '未生成可执行方案');
  const plannedCount = scheme.moves.filter((move) => move.statusHint === 'planned').length;
  assert(plannedCount >= 4, 'smoke 需要至少 4 个 planned move', { plannedCount });

  const taskId = `phase2-smoke-${Date.now()}`;

  const firstRun = await runMutedExecution(() =>
    executionService.executeOrganizationScheme({
      taskId,
      targetPath,
      scheme,
      scannedCount: profile.scanStats.totalFiles,
      batchSize: 2,
      maxBatchesPerRun: 1,
    })
  );

  assert(firstRun.success, '第一批执行失败', firstRun);
  assert(firstRun.paused === true, '第一批执行后应进入 paused');
  assert(firstRun.hasRemaining === true, '第一批执行后应存在剩余批次');

  const firstCheckpoint = await executionService.getExecutionCheckpoint(taskId);
  assert(firstCheckpoint, '第一批执行后应存在 checkpoint');
  assert(firstCheckpoint.nextPlannedIndex > 0, 'checkpoint nextPlannedIndex 应前进', firstCheckpoint);

  const runs = [firstRun];
  let latest = firstRun;
  let guard = 0;
  while (latest.hasRemaining && guard < 20) {
    const resumed = await runMutedExecution(() =>
      executionService.resumeExecutionTask({
        taskId,
        maxBatchesPerRun: 1,
      })
    );
    assert(resumed.success, 'resume 执行失败', resumed);
    runs.push(resumed);
    latest = resumed;
    guard += 1;
  }

  assert(!latest.hasRemaining, 'resume 循环结束后仍有剩余批次', summarize(latest));
  assert(latest.task?.status === 'completed', '最终任务状态应为 completed', summarize(latest));

  const finalCheckpoint = await executionService.getExecutionCheckpoint(taskId);
  assert(finalCheckpoint === null, '任务完成后 checkpoint 应清理');

  const report = await verificationService.verifyExecution({
    task: latest.task,
    receipt: latest.receipt,
  });

  assert(report.summary.failedCount === 0, 'phase2 smoke 不应出现失败', report.summary);
  assert(report.summary.successCount === plannedCount, 'phase2 smoke successCount 应等于 plannedCount', {
    successCount: report.summary.successCount,
    plannedCount,
  });

  console.log('[Phase2 Smoke] PASS');
  console.log(`  - targetPath: ${targetPath}`);
  console.log(`  - taskId: ${taskId}`);
  console.log(`  - runs: ${runs.length}`);
  console.log(`  - firstRun: ${JSON.stringify(summarize(firstRun))}`);
  console.log(`  - finalRun: ${JSON.stringify(summarize(latest))}`);
  console.log(`  - verification: ${JSON.stringify(report.summary)}`);
}

main().catch((error) => {
  console.error('[Phase2 Smoke] FAIL');
  console.error(`  - error: ${error.message}`);
  if (error.details) {
    console.error(`  - details: ${JSON.stringify(error.details)}`);
  }
  process.exitCode = 1;
});
