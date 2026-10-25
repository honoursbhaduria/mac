import type { Filters } from "../types/filters";
import { analysisQuery, apiUrl } from "./api";

/** URL of the server-side CSV export for exactly the filters used by the dashboard. */
export function exportCsvUrl(f: Filters): string {
  return apiUrl("/export.csv", analysisQuery(f));
}
