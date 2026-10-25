import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../services/api";
import { validateFilters, type Filters } from "../types/filters";

export function useAnalysis(filters: Filters) {
  const valid = Object.keys(validateFilters(filters)).length === 0;
  return useQuery({
    queryKey: ["analysis", filters],
    queryFn: ({ signal }) => api.analysis(filters, signal),
    enabled: valid,
    // Hold the previous result (dimmed) while a new filter set loads - no layout jump.
    placeholderData: keepPreviousData,
  });
}

export function useVintages(startTime: string | null, leadHours: number, alignment: Filters["alignment"]) {
  return useQuery({
    queryKey: ["vintages", startTime, leadHours, alignment],
    queryFn: ({ signal }) => api.vintages(startTime as string, leadHours, alignment, signal),
    enabled: startTime !== null,
  });
}

export function useMetadata() {
  return useQuery({
    queryKey: ["metadata"],
    queryFn: ({ signal }) => api.metadata(signal),
    staleTime: Infinity,
  });
}
