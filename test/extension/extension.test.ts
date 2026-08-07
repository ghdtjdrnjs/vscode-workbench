import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

const EXTENSION_ID = 'local.git-workbench';

interface MinimalRepository {
  rootUri: vscode.Uri;
}

/** 내장 Git extension이 workspace의 저장소를 찾을 때까지 기다린다. */
async function waitForRepository(): Promise<MinimalRepository> {
  const gitExtension = vscode.extensions.getExtension('vscode.git');
  assert.ok(gitExtension, 'vscode.git extension을 찾지 못했다');

  const exports = await gitExtension.activate();
  const api = exports.getAPI(1);

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (api.repositories.length > 0) {
      return api.repositories[0] as MinimalRepository;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error('내장 Git API가 저장소를 찾지 못했다');
}

suite('Git Workbench extension', () => {
  test('extension이 활성화된다', async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} 를 찾지 못했다`);

    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  test('command가 모두 등록되어 있다', async () => {
    const commands = await vscode.commands.getCommands(true);

    for (const id of [
      'gitWorkbench.showFileHistory',
      'gitWorkbench.openLog',
      'gitWorkbench.refresh',
    ]) {
      assert.ok(commands.includes(id), `${id} 가 등록되지 않았다`);
    }
  });

  test('설정 기본값이 계획서 값과 같다', () => {
    const config = vscode.workspace.getConfiguration('gitWorkbench');

    assert.equal(config.get('commitPageSize'), 200);
    assert.equal(config.get('fileHistoryPageSize'), 100);
    assert.equal(config.get('maxTextFileBytes'), 2097152);
  });

  test('저장되지 않은 문서에서는 안내 메시지로 끝난다', async () => {
    const document = await vscode.workspace.openTextDocument({
      content: 'untitled',
    });
    await vscode.window.showTextDocument(document);

    // 오류를 던지지 않고 경고 메시지로 처리해야 한다.
    await vscode.commands.executeCommand(
      'gitWorkbench.showFileHistory',
      document.uri,
    );
  });

  test('workspace의 Git 저장소를 내장 Git API로 찾는다', async () => {
    const repository = await waitForRepository();

    assert.ok(repository, 'workspace에서 Git 저장소를 찾지 못했다');
  });

  test('추적 중인 파일에서 File History를 열 수 있다', async () => {
    const repository = await waitForRepository();
    const target = vscode.Uri.joinPath(repository.rootUri, 'src', 'b.ts');

    // 열려 있는 에디터가 없어도 Explorer가 넘긴 URI로 동작해야 한다.
    await vscode.commands.executeCommand('gitWorkbench.showFileHistory', target);
  });

  test('한글과 공백이 있는 경로에서도 File History를 연다', async () => {
    const repository = await waitForRepository();
    const target = vscode.Uri.joinPath(
      repository.rootUri,
      '문서 폴더',
      '설계 문서.md',
    );

    await vscode.commands.executeCommand('gitWorkbench.showFileHistory', target);
  });

  test('Panel Webview가 예외 없이 resolve된다', async () => {
    // openLog는 gitWorkbench.main.focus를 실행하고, 그 과정에서
    // resolveWebviewView → getWebviewHtml이 호출된다.
    await vscode.commands.executeCommand('gitWorkbench.openLog');
  });

  test('refresh command가 예외 없이 실행된다', async () => {
    await vscode.commands.executeCommand('gitWorkbench.refresh');
  });
});
