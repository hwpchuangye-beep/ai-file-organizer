const fs = require('fs');
const path = require('path');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

function resolveSchemaDirectory() {
  const candidates = [
    path.join(__dirname, '..', '..', 'shared', 'schemas'),
    path.join(process.cwd(), 'src', 'shared', 'schemas'),
    path.join(process.cwd(), 'dist', 'shared', 'schemas'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Schema directory not found. Checked: ${candidates.join(', ')}`);
}

const SCHEMA_DIR = resolveSchemaDirectory();

const SCHEMA_FILES = [
  'directory-target.schema.json',
  'directory-profile.schema.json',
  'organization-scheme.schema.json',
  'organization-plan.schema.json',
  'execution-task.schema.json',
  'execution-receipt.schema.json',
  'execution-checkpoint.schema.json',
  'verification-report.schema.json',
  'preference-memory.schema.json',
];

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
});
addFormats(ajv);

for (const schemaFile of SCHEMA_FILES) {
  const schemaPath = path.join(SCHEMA_DIR, schemaFile);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  ajv.addSchema(schema, schema.$id || schemaFile);
}

function getValidator(schemaId) {
  const validator = ajv.getSchema(schemaId);
  if (!validator) {
    throw new Error(`Schema not found: ${schemaId}`);
  }
  return validator;
}

function normalizeErrors(errors = []) {
  return errors.map((err) => ({
    instancePath: err.instancePath,
    schemaPath: err.schemaPath,
    keyword: err.keyword,
    message: err.message,
    params: err.params,
  }));
}

function validateBySchemaId(schemaId, data) {
  const validator = getValidator(schemaId);
  const valid = validator(data);
  return {
    valid,
    errors: valid ? [] : normalizeErrors(validator.errors),
  };
}

function assertValid(schemaId, data, errorPrefix = 'Schema validation failed') {
  const result = validateBySchemaId(schemaId, data);
  if (!result.valid) {
    const error = new Error(`${errorPrefix}: ${schemaId}`);
    error.validationErrors = result.errors;
    throw error;
  }
}

module.exports = {
  validateBySchemaId,
  assertValid,
  validateDirectoryTarget: (data) => validateBySchemaId('directory-target.schema.json', data),
  validateDirectoryProfile: (data) => validateBySchemaId('directory-profile.schema.json', data),
  validateOrganizationScheme: (data) => validateBySchemaId('organization-scheme.schema.json', data),
  validateOrganizationPlan: (data) => validateBySchemaId('organization-plan.schema.json', data),
  validateExecutionTask: (data) => validateBySchemaId('execution-task.schema.json', data),
  validateExecutionReceipt: (data) => validateBySchemaId('execution-receipt.schema.json', data),
  validateExecutionCheckpoint: (data) => validateBySchemaId('execution-checkpoint.schema.json', data),
  validateVerificationReport: (data) => validateBySchemaId('verification-report.schema.json', data),
  validatePreferenceMemory: (data) => validateBySchemaId('preference-memory.schema.json', data),
};
