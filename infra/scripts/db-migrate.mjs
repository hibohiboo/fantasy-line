import { spawnSync, execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const cfnResult = spawnSync(
  'aws',
  [
    'cloudformation', 'describe-stacks',
    '--stack-name', 'InfraStack',
    '--query', 'Stacks[0].Outputs[?OutputKey==`MigrationFunctionName`].OutputValue | [0]',
    '--output', 'text',
  ],
  { encoding: 'utf-8' },
);

if (cfnResult.error || cfnResult.status !== 0) {
  console.error(cfnResult.stderr || cfnResult.error);
  process.exit(1);
}

const functionName = cfnResult.stdout.trim();

if (!functionName) {
  console.error(
    'MigrationFunctionNameが取得できませんでした。InfraStackがデプロイ済か確認してください。',
  );
  process.exit(1);
}

console.log(`Invoking Lambda: ${functionName}`);

const outFile = join(tmpdir(), 'lambda-migrate-out.json');
execSync(
  `aws lambda invoke --function-name ${functionName} --payload "{}" --cli-binary-format raw-in-base64-out "${outFile}"`,
  { stdio: 'inherit' },
);

const result = readFileSync(outFile, 'utf-8');
console.log(result);
unlinkSync(outFile);
