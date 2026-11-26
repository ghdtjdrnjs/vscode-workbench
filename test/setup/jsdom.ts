/**
 * jsdom에 없는 브라우저 API를 채운다.
 * webview 컴포넌트가 실제 브라우저에서 쓰는 것만 최소로 넣는다.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    public observe(): void {}
    public unobserve(): void {}
    public disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}
