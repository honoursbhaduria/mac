import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DEFAULT_FILTERS, filtersFromParams, filtersToParams, type Filters } from "../types/filters";

/** Applied filters live in the URL so every page (and a shared link) sees the same slice. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);

  const apply = useCallback(
    (next: Filters) => setParams((prev) => filtersToParams(next, prev), { replace: false }),
    [setParams],
  );
  const reset = useCallback(() => apply(DEFAULT_FILTERS), [apply]);

  return { filters, apply, reset };
}
