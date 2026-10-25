import { useAnalysis } from "./useAnalysis";
import { useFilters } from "./useFilters";

export function usePageAnalysis() {
  const { filters } = useFilters();
  const query = useAnalysis(filters);
  return { filters, query };
}
