import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@vscode/test-cli';

// Extension Host 테스트를 실제 Git 저장소 안에서 돌린다.
// rename/merge/한글 경로가 들어 있는 fixture 저장소를 매번 새로 만든다.
const fixtureRepo = join(tmpdir(), 'gwb-extension-fixture');
execFileSync('sh', ['test/fixtures/create-repo.sh', fixtureRepo], {
  stdio: 'inherit',
});

export default defineConfig({
  files: 'dist/test/**/*.test.js',
  workspaceFolder: fixtureRepo,
  mocha: {
    timeout: 30000,
  },
});
