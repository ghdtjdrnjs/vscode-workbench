import type { ChangedFile, CommitDetail } from '../../../src/shared/models';
import { VirtualList } from '../../components/VirtualList';
import { EmptyState, ErrorState, Loading } from '../../components/States';
import { formatDateTimeFull } from '../../format';
import { ParentSelector } from './ParentSelector';

interface CommitDetailsProps {
  detail?: CommitDetail;
  loading: boolean;
  error?: string;
  parentIndex: number;
  selectedFileIndex: number;
  onChangeParent: (index: number) => void;
  onSelectFile: (index: number) => void;
  onOpenFile: (file: ChangedFile) => void;
}

const STATUS_TITLE: Record<string, string> = {
  A: '추가',
  M: '수정',
  D: '삭제',
  R: '이름 변경',
  C: '복사',
  T: '타입 변경',
  U: '충돌',
};

const FILE_ROW_HEIGHT = 22;

export function CommitDetails({
  detail,
  loading,
  error,
  parentIndex,
  selectedFileIndex,
  onChangeParent,
  onSelectFile,
  onOpenFile,
}: CommitDetailsProps): JSX.Element {
  if (loading) {
    return <Loading label="커밋 정보를 불러오는 중" />;
  }

  if (error) {
    return <ErrorState title="커밋 정보를 불러오지 못했습니다" detail={error} />;
  }

  if (!detail) {
    return <EmptyState title="가운데에서 커밋을 선택하세요." />;
  }

  const local = detail.containingBranches.filter(ref => ref.kind === 'local');
  const remote = detail.containingBranches.filter(ref => ref.kind === 'remote');

  return (
    <div className="commit-details">
      <div className="detail-scroll">
        <h3 className="detail-subject">{detail.subject}</h3>
        {detail.body ? <pre className="detail-body">{detail.body}</pre> : null}

        <dl className="detail-meta">
          <dt>작성자</dt>
          <dd>
            {detail.authorName}
            {detail.authorEmail ? ` <${detail.authorEmail}>` : ''}
          </dd>
          <dt>작성일</dt>
          <dd>{formatDateTimeFull(detail.authorDate)}</dd>
          <dt>해시</dt>
          <dd className="mono">{detail.hash}</dd>
          {detail.parentHashes.length > 0 ? (
            <>
              <dt>Parent</dt>
              <dd className="mono">
                {detail.parentHashes.map(hash => hash.slice(0, 7)).join(', ')}
              </dd>
            </>
          ) : (
            <>
              <dt>Parent</dt>
              <dd>없음 (root commit)</dd>
            </>
          )}
        </dl>

        <div className="branch-chips">
          {local.length > 0 ? (
            <div className="chip-group">
              <span className="chip-label">Local</span>
              {local.map(ref => (
                <span className="chip local" key={ref.fullName}>
                  {ref.shortName}
                </span>
              ))}
            </div>
          ) : null}
          {remote.length > 0 ? (
            <div className="chip-group">
              <span className="chip-label">Remote</span>
              {remote.map(ref => (
                <span className="chip remote" key={ref.fullName}>
                  {ref.shortName}
                </span>
              ))}
            </div>
          ) : null}
          {local.length === 0 && remote.length === 0 ? (
            <span className="chip-label">포함된 브랜치 없음</span>
          ) : null}
        </div>

        <ParentSelector
          parentHashes={detail.parentHashes}
          parentIndex={parentIndex}
          onChange={onChangeParent}
        />
      </div>

      <div className="changed-files">
        <div className="changed-files-header">
          변경 파일 {detail.changedFiles.length}개
          <span className="hint">더블클릭 또는 Enter로 diff 보기</span>
        </div>
        {detail.changedFiles.length === 0 ? (
          <EmptyState title="이 parent 기준으로 변경된 파일이 없습니다." />
        ) : (
          <VirtualList
            items={detail.changedFiles}
            rowHeight={FILE_ROW_HEIGHT}
            ariaLabel="변경 파일"
            selectedIndex={selectedFileIndex}
            onSelect={onSelectFile}
            onActivate={index => onOpenFile(detail.changedFiles[index])}
            keyOf={(file, index) => `${file.newPath}-${index}`}
            renderRow={file => (
              <div className="file-row">
                <span
                  className={`status-chip status-${file.status}`}
                  title={STATUS_TITLE[file.status] ?? file.status}
                >
                  {file.status}
                </span>
                {file.status === 'R' || file.status === 'C' ? (
                  <span className="file-path" title={`${file.oldPath} → ${file.newPath}`}>
                    <span className="path-old">{file.oldPath}</span>
                    <span className="path-arrow"> → </span>
                    {file.newPath}
                  </span>
                ) : (
                  <span className="file-path" title={file.newPath}>
                    {file.newPath}
                  </span>
                )}
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
