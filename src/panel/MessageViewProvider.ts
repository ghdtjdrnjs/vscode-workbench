import * as vscode from 'vscode';
import { createNonce } from './nonce';

/**
 * 확장을 정상적으로 준비하지 못했을 때 대신 등록하는 view.
 *
 * 활성화가 실패해도 view를 등록하지 않으면 패널이 탭만 남고 완전히 비어 버린다.
 * 그러면 사용자가 원인을 알 방법이 없다. 최소한 이유는 보여 준다.
 */
export class MessageViewProvider implements vscode.WebviewViewProvider {
  public constructor(
    private readonly title: string,
    private readonly detail: string,
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = { enableScripts: false };
    view.webview.html = this.render();
  }

  private render(): string {
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <style nonce="${nonce}">
      body {
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        padding: 16px;
        margin: 0;
      }
      h3 { margin: 0 0 8px; color: var(--vscode-errorForeground); }
      p { margin: 0 0 6px; white-space: pre-wrap; }
      code {
        font-family: var(--vscode-editor-font-family, monospace);
        background: var(--vscode-textCodeBlock-background);
        padding: 0 4px;
        border-radius: 3px;
      }
    </style>
  </head>
  <body>
    <h3>${escapeHtml(this.title)}</h3>
    <p>${escapeHtml(this.detail)}</p>
    <p>자세한 내용은 <code>출력</code> 패널의 <code>Git Workbench</code> 채널을 확인하세요.</p>
  </body>
</html>`;
  }
}

/** HTML에 넣기 전에 반드시 이스케이프한다. 오류 메시지에는 경로와 stderr가 섞여 있다. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
