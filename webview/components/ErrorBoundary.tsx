import { Component, Fragment } from 'react';
import { reportError, requestReload } from '../vscode';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
  /** '다시 시도'마다 올려 children을 새로 마운트한다. */
  attempt: number;
}

/**
 * 렌더 중 예외가 나면 React는 트리 전체를 언마운트한다.
 * 그대로 두면 패널이 빈 화면으로 남고 창을 다시 로드하는 수밖에 없다.
 * 이 경계 안쪽만 오류 화면으로 바꾸고 복구 버튼을 준다.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { attempt: 0 };

  public static getDerivedStateFromError(
    error: Error,
  ): Partial<ErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportError(error, info.componentStack ?? undefined);
  }

  private readonly retry = (): void => {
    this.setState(current => ({
      error: undefined,
      attempt: current.attempt + 1,
    }));
  };

  public render(): React.ReactNode {
    const { error, attempt } = this.state;

    if (error) {
      return (
        <div className="state-block error" role="alert">
          <strong>화면을 그리는 중 오류가 발생했습니다</strong>
          <span className="state-detail">{error.message}</span>
          <span className="state-detail">
            자세한 내용은 출력 → Git Workbench 채널에 기록됩니다.
          </span>
          <div className="state-actions">
            <button type="button" onClick={this.retry}>
              다시 시도
            </button>
            <button type="button" onClick={requestReload}>
              화면 새로고침
            </button>
          </div>
        </div>
      );
    }

    return <Fragment key={attempt}>{this.props.children}</Fragment>;
  }
}
