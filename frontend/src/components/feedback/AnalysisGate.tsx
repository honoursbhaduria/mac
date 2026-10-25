import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Analysis } from "../../types/api";
import { EmptyState, ErrorState, FieldSkeleton } from "./Feedback";

interface Props {
  query: UseQueryResult<Analysis>;
  children: (data: Analysis, refreshing: boolean) => ReactNode;
  skeletonHeight?: number;
}

/** Shared loading / error / empty handling. During a refetch the previous result stays visible (dimmed). */
export function AnalysisGate({ query, children, skeletonHeight }: Props) {
  if (query.isError && (!query.data || !query.isPlaceholderData)) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (!query.data) return <FieldSkeleton height={skeletonHeight} label="Loading analysis from Elexon data" />;
  if (query.data.coverage.evaluation_intervals === 0) {
    return (
      <EmptyState title="No delivery intervals in this window">
        No hourly delivery interval has its decision cutoff inside the decision dates and also falls inside
        the delivery dates. Widen the dates or remove the delivery restriction.
      </EmptyState>
    );
  }
  return <>{children(query.data, query.isFetching && query.isPlaceholderData)}</>;
}
