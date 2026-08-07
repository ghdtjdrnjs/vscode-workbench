/**
 * vitest에서 서비스 계층을 실제 Git 저장소에 대해 돌리기 위한 최소 vscode 스텁.
 * Extension Host 없이 GitProcessRunner/Service가 만드는 git 인자를 실제로 검증한다.
 */
import { pathToFileURL } from 'node:url';

export class CancellationError extends Error {
  public constructor() {
    super('Canceled');
    this.name = 'CancellationError';
  }
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export class CancellationTokenSource {
  private listeners: Array<() => void> = [];

  public readonly token: CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void) => {
      this.listeners.push(listener);
      return {
        dispose: () => {
          this.listeners = this.listeners.filter(entry => entry !== listener);
        },
      };
    },
  };

  public cancel(): void {
    (this.token as { isCancellationRequested: boolean }).isCancellationRequested =
      true;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  public dispose(): void {
    this.listeners = [];
  }
}

export class Uri {
  private constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
  ) {}

  public static file(fsPath: string): Uri {
    return new Uri('file', fsPath);
  }

  public static parse(value: string): Uri {
    const url = new URL(value);
    return new Uri(url.protocol.replace(':', ''), decodeURIComponent(url.pathname));
  }

  public static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.fsPath, ...segments].join('/'));
  }

  public toString(): string {
    return pathToFileURL(this.fsPath).toString();
  }
}

export const workspace = {
  isTrusted: true,
  getConfiguration() {
    return {
      get<T>(_key: string, fallback: T): T {
        return fallback;
      },
    };
  },
};

export const window = {
  createOutputChannel(): OutputChannel {
    return createOutputChannel();
  },
};

export interface OutputChannel {
  appendLine(value: string): void;
  dispose(): void;
}

export function createOutputChannel(): OutputChannel {
  return {
    appendLine: () => undefined,
    dispose: () => undefined,
  };
}

export interface Disposable {
  dispose(): void;
}

export interface Event<T> {
  (listener: (value: T) => void): Disposable;
}
