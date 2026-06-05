import type { CSSProperties } from "react";

/**
 * Skeleton loading primitives — shimmer placeholders that mirror the real components while data
 * loads. All build on the shared `.skeleton` class in index.css. Prefer these over a bare spinner
 * for content that has a known shape (lists, cards, stats, tables). See `bora-ui-components`.
 */

/** Base shimmer block. `w`/`h` accept any CSS size; defaults to a single text line. */
export function Skeleton({
  w = "100%",
  h = 14,
  radius = "var(--r-sm)",
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: radius, ...style }} aria-hidden />;
}

/** A few stacked text lines; the last is shorter to look natural. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="col" style={{ gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? "55%" : "100%"} />
      ))}
    </div>
  );
}

/** One `.list-row` placeholder: title + subtitle on the left, an action chip on the right. */
export function SkeletonRow({ action = true }: { action?: boolean }) {
  return (
    <div className="list-row">
      <div className="col" style={{ gap: 8, flex: 1, minWidth: 0 }}>
        <Skeleton w="38%" h={13} />
        <Skeleton w="22%" h={11} />
      </div>
      {action && <Skeleton w={72} h={28} radius="var(--r-sm)" />}
    </div>
  );
}

/** A `.list` of row placeholders. */
export function SkeletonList({ rows = 3, action = true }: { rows?: number; action?: boolean }) {
  return (
    <div className="list">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} action={action} />
      ))}
    </div>
  );
}

/** A `.card` placeholder: a heading line + body text lines. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card col" style={{ gap: 14 }}>
      <Skeleton w="30%" h={16} />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** A `.stat` KPI-card placeholder. */
export function SkeletonStat() {
  return (
    <div className="stat col" style={{ gap: 10 }}>
      <Skeleton w="55%" h={11} />
      <Skeleton w="42%" h={26} />
    </div>
  );
}

/** A responsive grid of card placeholders (e.g. the projects grid on Home). */
export function SkeletonGrid({ count = 3, height = 104 }: { count?: number; height?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} h={height} radius="var(--r-lg)" />
      ))}
    </div>
  );
}
