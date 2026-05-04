import { execSync as exec } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const functionName = exec(
  'aws cloudformation describe-stacks --stack-name InfraStack' +
    ' --query "Stacks[0].Outputs[?OutputKey==`MigrationFunctionName`].OutputValue' +
    ` --output text`,
)
  .toString()
  .trim();

if (!functionName) {
  console.error(
    'MigrationFunctionNameが取得できませんでした。InfraStackがデプロイ済か確認してください。',
  );
  process.exit(1);
}

console.log(`Invoking Lambda: ${functionName}`);

const outFile = join(tmpdir(), 'lambda-migrate-out.json');
exec(
  `aws lambda invoke --function-name ${functionName} --payload "{}" --cli-binary-format raw-in-base64-out "${outFile}"`,
  { stdio: 'inherit' },
);

const result = readFileSync(outFile, 'utf-8');
console.log(result);
unlinkSync(outFile);
