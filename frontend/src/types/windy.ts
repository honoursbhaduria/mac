/** Types for Windy AI Agent interaction. */

export interface ActionItem {
  label: string;
  query: string;
}

export interface WindyMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  suggestedActions?: ActionItem[];
  contextPruned?: boolean;
  dataUsed?: boolean;
}

export interface WindyChatRequest {
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
  filters?: {
    decision_from?: string;
    decision_to?: string;
    decision_lead_hours?: number;
    actual_alignment?: "exact" | "hourly_mean";
    delivery_from?: string;
    delivery_to?: string;
  };
}

export interface WindyChatResponse {
  response: string;
  suggested_actions: ActionItem[];
  intent: string;
  data_used: boolean;
  context_pruned: boolean;
  token_estimate: number;
}

export interface WindyStatusResponse {
  status: string;
  agent_name: string;
  model: string;
  fallback_model: string;
  max_history_turns: number;
  groq_configured: boolean;
}
