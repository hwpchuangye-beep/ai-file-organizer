const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const schemaValidator = require('./schemaValidatorService.cjs');

const TASK_STORAGE_DIR = path.join(os.homedir(), '.ai-file-organizer', 'phase2-tasks');
const TASK_FILE_SUFFIX = '.task.json';
const CHECKPOINT_FILE_SUFFIX = '.checkpoint.json';

function taskFilePath(taskId) {
  return path.join(TASK_STORAGE_DIR, `${taskId}${TASK_FILE_SUFFIX}`);
}

function checkpointFilePath(taskId) {
  return path.join(TASK_STORAGE_DIR, `${taskId}${CHECKPOINT_FILE_SUFFIX}`);
}

async function ensureStorage() {
  await fs.mkdir(TASK_STORAGE_DIR, { recursive: true });
}

async function saveTask(task) {
  await ensureStorage();
  schemaValidator.assertValid('execution-task.schema.json', task, 'ExecutionTask validation failed');
  await fs.writeFile(taskFilePath(task.taskId), JSON.stringify(task, null, 2), 'utf8');
}

async function loadTask(taskId) {
  try {
    const raw = await fs.readFile(taskFilePath(taskId), 'utf8');
    const parsed = JSON.parse(raw);
    const validation = schemaValidator.validateExecutionTask(parsed);
    if (!validation.valid) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveCheckpoint(checkpoint) {
  await ensureStorage();
  schemaValidator.assertValid('execution-checkpoint.schema.json', checkpoint, 'ExecutionCheckpoint validation failed');
  await fs.writeFile(checkpointFilePath(checkpoint.taskId), JSON.stringify(checkpoint, null, 2), 'utf8');
}

async function loadCheckpoint(taskId) {
  try {
    const raw = await fs.readFile(checkpointFilePath(taskId), 'utf8');
    const parsed = JSON.parse(raw);
    const validation = schemaValidator.validateExecutionCheckpoint(parsed);
    if (!validation.valid) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function clearCheckpoint(taskId) {
  try {
    await fs.rm(checkpointFilePath(taskId), { force: true });
  } catch {}
}

module.exports = {
  ensureStorage,
  saveTask,
  loadTask,
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  taskFilePath,
  checkpointFilePath,
};

