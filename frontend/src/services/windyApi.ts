import { apiUrl, ApiError } from "./api";
import type { WindyChatRequest, WindyChatResponse, WindyStatusResponse } from "../types/windy";

export async function sendWindyChat(req: WindyChatRequest, signal?: AbortSignal): Promise<WindyChatResponse> {
  let res: Response;
  try {
    res = await fetch(apiUrl("/windy/chat"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(
      0,
      "network_error",
      "Could not connect to Windy assistant. Please verify your connection.",
    );
  }

  if (!res.ok) {
    throw new ApiError(res.status, "windy_error", `Windy service returned an error (HTTP ${res.status}).`);
  }

  return (await res.json()) as WindyChatResponse;
}

export async function getWindyStatus(signal?: AbortSignal): Promise<WindyStatusResponse> {
  const res = await fetch(apiUrl("/windy/status"), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new ApiError(res.status, "status_error", "Failed to retrieve Windy status");
  }
  return (await res.json()) as WindyStatusResponse;
}
