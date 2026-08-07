import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { GitWorkbenchError, classifyGitStderr } from '../shared/errors';

export interface GitResult {
  stdout: Buffer;
  stderr: string;
  truncated: boolean;
}

export interface RunOptions {
  /** stdout이 이 크기를 넘으면 process를 종료하고 truncated로 표시한다. */
  maxStdoutBytes?: number;
}

const DEFAULT_MAX_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_STDERR_BYTES = 32 * 1024;

/**
 * Git CLI 실행 담당. shell을 쓰지 않고 인자 배열만 전달한다.
 * 사용자 입력이 shell 문자열로 합쳐지지 않는 것이 이 클래스의 핵심 계약이다.
 */
export class GitProcessRunner {
  public constructor(
    private readonly gitPath: string,
    private readonly output: vscode.OutputChannel,
  ) {}

  public run(
    cwd: string,
    args: readonly string[],
    token?: vscode.CancellationToken,
    options: RunOptions = {},
  ): Promise<GitResult> {
    const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;

    return new Promise<GitResult>((resolve, reject) => {
      const startedAt = Date.now();

      if (token?.isCancellationRequested) {
        reject(new vscode.CancellationError());
        return;
      }

      const child = spawn(
        this.gitPath,
        // core.quotepath=false: 한글/UTF-8 경로가 diff 헤더에서 C-escape되지 않게 한다.
        ['--no-pager', '-c', 'core.quotepath=false', ...args],
        {
          cwd,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            GIT_OPTIONAL_LOCKS: '0',
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            LC_ALL: 'C',
          },
        },
      );

      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let truncated = false;
      let settled = false;

      const finish = (): void => {
        settled = true;
        cancellation?.dispose();
      };

      const cancellation = token?.onCancellationRequested(() => {
        if (!settled) {
          child.kill();
        }
      });

      child.stdout.on('data', (chunk: Buffer) => {
        if (truncated) {
          return;
        }

        stdoutBytes += chunk.length;

        if (stdoutBytes > maxStdoutBytes) {
          truncated = true;
          child.kill();
          return;
        }

        stdout.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderrBytes >= MAX_STDERR_BYTES) {
          return;
        }

        stderrBytes += chunk.length;
        stderr.push(chunk);
      });

      child.once('error', error => {
        finish();

        const code =
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'GIT_NOT_FOUND'
            : 'GIT_COMMAND_FAILED';

        reject(
          new GitWorkbenchError(code, error.message, true, { cause: error }),
        );
      });

      child.once('close', code => {
        finish();

        const stderrText = Buffer.concat(stderr)
          .subarray(0, MAX_STDERR_BYTES)
          .toString('utf8');

        this.output.appendLine(
          `[git] ${args.slice(0, 2).join(' ')} exit=${code} ${
            Date.now() - startedAt
          }ms cwd=${cwd}`,
        );

        if (token?.isCancellationRequested) {
          reject(new vscode.CancellationError());
          return;
        }

        if (truncated) {
          resolve({
            stdout: Buffer.concat(stdout),
            stderr: stderrText,
            truncated: true,
          });
          return;
        }

        if (code !== 0) {
          this.output.appendLine(`[git] stderr: ${stderrText.trim()}`);
          reject(
            new GitWorkbenchError(
              classifyGitStderr(stderrText),
              stderrText.trim() || `Git exited with code ${code}`,
            ),
          );
          return;
        }

        resolve({
          stdout: Buffer.concat(stdout),
          stderr: stderrText,
          truncated: false,
        });
      });
    });
  }

  public async runText(
    cwd: string,
    args: readonly string[],
    token?: vscode.CancellationToken,
    options?: RunOptions,
  ): Promise<string> {
    const result = await this.run(cwd, args, token, options);
    return result.stdout.toString('utf8');
  }
}
