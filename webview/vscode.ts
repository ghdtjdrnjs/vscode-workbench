import type {
  ExtensionMessage,
  ExtensionNotification,
  ExtensionResponse,
  RequestGroup,
  WebviewRequest,
} from '../src/shared/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api = acquireVsCodeApi();

/** 같은 그룹의 새 요청 때문에 버려진 요청. UI는 이 오류를 표시하지 않는다. */
export class SupersededError extends Error {
  public constructor() {
    super('superseded');
    this.name = 'SupersededError';
  }
}

export class RequestError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean,
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

/** union의 각 멤버에 개별적으로 Omit을 적용한다. 그냥 Omit을 쓰면 공통 필드만 남는다. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type RequestPayload = DistributiveOmit<WebviewRequest, 'requestId'>;

type Pending = {
  resolve: (value: ExtensionResponse) => void;
  reject: (error: unknown) => void;
};

const pending = new Map<string, Pending>();
const latestByGroup = new Map<RequestGroup, string>();
const notificationListeners = new Set<(message: ExtensionNotification) => void>();

let sequence = 0;

function nextRequestId(): string {
  sequence += 1;
  return `r${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

window.addEventListener('message', event => {
  const message = event.data as ExtensionMessage | undefined;

  if (!message || typeof message !== 'object' || !('type' in message)) {
    return;
  }

  if (!('requestId' in message)) {
    for (const listener of notificationListeners) {
      listener(message as ExtensionNotification);
    }
    return;
  }

  const response = message as ExtensionResponse;
  const entry = pending.get(response.requestId);

  if (!entry) {
    return;
  }

  pending.delete(response.requestId);

  if (response.type === 'request/error') {
    entry.reject(
      new RequestError(response.code, response.message, response.recoverable),
    );
    return;
  }

  entry.resolve(response);
});

export function onNotification(
  listener: (message: ExtensionNotification) => void,
): () => void {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

/**
 * 요청을 보내고 응답을 기다린다.
 * group을 주면 같은 그룹의 이전 요청을 버리고 취소 메시지를 보낸다.
 * Extension Host도 그룹 단위로 취소하므로 버려진 요청은 응답이 오지 않는다.
 */
export function request<T extends ExtensionResponse>(
  payload: RequestPayload,
  group?: RequestGroup,
): Promise<T> {
  const requestId = nextRequestId();

  if (group) {
    const previousId = latestByGroup.get(group);
    const previous = previousId ? pending.get(previousId) : undefined;

    if (previousId && previous) {
      pending.delete(previousId);
      previous.reject(new SupersededError());
      api.postMessage({
        type: 'request/cancel',
        requestId: nextRequestId(),
        targetRequestId: previousId,
      });
    }

    latestByGroup.set(group, requestId);
  }

  return new Promise<T>((resolve, reject) => {
    pending.set(requestId, {
      resolve: response => resolve(response as T),
      reject,
    });

    api.postMessage({ ...payload, requestId });
  });
}

export function isSuperseded(error: unknown): boolean {
  return error instanceof SupersededError;
}

/**
 * Webview state에 저장하는 UI 값.
 * localStorage 대신 VS Code state를 쓰면 panel을 숨겼다 열어도 유지된다.
 */
interface UiState {
  splitRatios: Record<string, number>;
}

function readUiState(): UiState {
  const state = api.getState<Partial<UiState>>();
  return { splitRatios: state?.splitRatios ?? {} };
}

export function getSplitRatio(key: string, fallback: number): number {
  const stored = readUiState().splitRatios[key];
  return typeof stored === 'number' && Number.isFinite(stored)
    ? stored
    : fallback;
}

export function setSplitRatio(key: string, ratio: number): void {
  const state = readUiState();
  api.setState({
    ...state,
    splitRatios: { ...state.splitRatios, [key]: ratio },
  });
}
