import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Extension Host 없이 서비스 계층을 실제 Git 저장소에 대해 실행한다.
      vscode: resolve(__dirname, 'test/stubs/vscode.ts'),
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
