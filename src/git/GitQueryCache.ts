import * as vscode from 'vscode';

interface CacheEntry<T> {
  value: T;
  size: number;
  expiresAt: number;
}

export interface CacheOptions {
  /** 항목 최대 개수. */
  maxEntries?: number;
  /** 저장한 값의 누적 크기 상한(대략적인 문자 수). */
  maxSize?: number;
  /** 기본 TTL(ms). 0이면 만료하지 않는다. */
  ttlMs?: number;
}

/**
 * repository 단위로 격리된 LRU 캐시.
 * key는 항상 `{namespace}:{repositoryId}:...` 형태로 만든다.
 */
export class GitQueryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private totalSize = 0;

  public constructor(
    private readonly output: vscode.OutputChannel,
    options: CacheOptions = {},
  ) {
    this.maxEntries = options.maxEntries ?? 200;
    this.maxSize = options.maxSize ?? 16 * 1024 * 1024;
    this.ttlMs = options.ttlMs ?? 0;
  }

  public get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt !== 0 && entry.expiresAt < Date.now()) {
      this.delete(key);
      return undefined;
    }

    // LRU: 최근 사용 항목을 뒤로 보낸다.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.output.appendLine(`[cache] hit ${key}`);

    return entry.value as T;
  }

  public set<T>(key: string, value: T, size = 1): void {
    this.delete(key);

    this.entries.set(key, {
      value,
      size,
      expiresAt: this.ttlMs > 0 ? Date.now() + this.ttlMs : 0,
    });
    this.totalSize += size;

    this.evict();
  }

  public delete(key: string): void {
    const entry = this.entries.get(key);

    if (entry) {
      this.totalSize -= entry.size;
      this.entries.delete(key);
    }
  }

  public clear(): void {
    this.entries.clear();
    this.totalSize = 0;
  }

  private evict(): void {
    while (
      this.entries.size > this.maxEntries ||
      this.totalSize > this.maxSize
    ) {
      const oldest = this.entries.keys().next();

      if (oldest.done) {
        return;
      }

      this.delete(oldest.value);
    }
  }
}
