import type { GraphRow } from './commitGraph';

const LANE_WIDTH = 12;
const MAX_RENDERED_LANES = 8;

const LANE_COLORS = [
  'var(--vscode-charts-blue, #3794ff)',
  'var(--vscode-charts-green, #89d185)',
  'var(--vscode-charts-orange, #d18616)',
  'var(--vscode-charts-purple, #b180d7)',
  'var(--vscode-charts-red, #f14c4c)',
  'var(--vscode-charts-yellow, #cca700)',
];

function colorOf(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length];
}

function x(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

export function CommitGraphCell({
  row,
  laneCount,
  height,
}: {
  row: GraphRow;
  laneCount: number;
  height: number;
}): JSX.Element {
  const lanes = Math.min(laneCount, MAX_RENDERED_LANES);
  const width = lanes * LANE_WIDTH;
  const middle = height / 2;

  const paths: JSX.Element[] = [];

  for (const lane of row.passThrough) {
    if (lane >= lanes) {
      continue;
    }

    paths.push(
      <line
        key={`pass-${lane}`}
        x1={x(lane)}
        y1={0}
        x2={x(lane)}
        y2={height}
        stroke={colorOf(lane)}
        strokeWidth={1.5}
      />,
    );
  }

  for (const lane of row.incoming) {
    if (lane >= lanes) {
      continue;
    }

    paths.push(
      <path
        key={`in-${lane}`}
        d={curve(x(lane), 0, x(row.lane), middle)}
        stroke={colorOf(lane)}
        strokeWidth={1.5}
        fill="none"
      />,
    );
  }

  for (const lane of row.outgoing) {
    if (lane >= lanes) {
      continue;
    }

    paths.push(
      <path
        key={`out-${lane}`}
        d={curve(x(row.lane), middle, x(lane), height)}
        stroke={colorOf(lane)}
        strokeWidth={1.5}
        fill="none"
      />,
    );
  }

  return (
    <svg
      className="commit-graph"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {paths}
      {row.lane < lanes ? (
        <circle
          cx={x(row.lane)}
          cy={middle}
          r={3.5}
          fill={colorOf(row.lane)}
          stroke="var(--vscode-editor-background)"
          strokeWidth={1}
        />
      ) : null}
    </svg>
  );
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export const GRAPH_LANE_WIDTH = LANE_WIDTH;
export const GRAPH_MAX_LANES = MAX_RENDERED_LANES;
