import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, RotateCcw, Sparkles } from "lucide-react";
import { useFilters } from "../../hooks/useFilters";
import { sendWindyChat } from "../../services/windyApi";
import type { WindyMessage, ActionItem } from "../../types/windy";
import { MarkdownView } from "./MarkdownView";
import windIcon from "../../assets/wind.png";

let messageCounter = 0;
function createMessageId(prefix: string): string {
  messageCounter += 1;
  return `${prefix}-${messageCounter}`;
}

function getFormattedTime(): string {
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

const STARTER_PROMPTS: ActionItem[] = [
  { label: "January 2026 KPIs", query: "What are the overall forecast accuracy KPIs for January 2026?" },
  { label: "Highest error day", query: "Which day in January had the largest forecast error and why?" },
  {
    label: "Why 24h lead time?",
    query: "Why is the decision lead time 24 hours and how does it prevent hindsight bias?",
  },
  {
    label: "Why WAPE over MAPE?",
    query: "Why does this platform use WAPE instead of MAPE for wind scoring?",
  },
];

export function WindyWidget() {
  const { filters } = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<WindyMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Close drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setHasUnread(false);
  };

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) setHasUnread(false);
      return next;
    });
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || isLoading) return;

    setInput("");
    const userMsg: WindyMessage = {
      id: createMessageId("user"),
      role: "user",
      content: query,
      timestamp: getFormattedTime(),
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      const apiHistory = newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await sendWindyChat({
        message: query,
        history: apiHistory,
        filters: {
          decision_from: filters.decisionFrom,
          decision_to: filters.decisionTo,
          decision_lead_hours: filters.leadHours,
          actual_alignment: filters.alignment,
          delivery_from: filters.deliveryFrom ?? undefined,
          delivery_to: filters.deliveryTo ?? undefined,
        },
      });

      const assistantMsg: WindyMessage = {
        id: createMessageId("windy"),
        role: "assistant",
        content: res.response,
        timestamp: getFormattedTime(),
        suggestedActions: res.suggested_actions,
        contextPruned: res.context_pruned,
        dataUsed: res.data_used,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (!isOpen) {
        setHasUnread(true);
      }
    } catch (err: unknown) {
      const errorMsg: WindyMessage = {
        id: createMessageId("err"),
        role: "assistant",
        content: `Sorry, I encountered an issue: ${err instanceof Error ? err.message : "Service unreachable"}. Please retry.`,
        timestamp: getFormattedTime(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
  };

  return (
    <>
      {/* Floating Toggle Launcher (visible when closed, themed paper look, no green dot) */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpen}
            className="group hidden items-center gap-2.5 rounded-full border border-[var(--rule-strong)] bg-[var(--paper-raised)] py-2.5 pl-3.5 pr-4 shadow-lg transition-all duration-200 hover:border-[var(--state)] hover:shadow-xl sm:flex"
            aria-label="Ask Windy button"
          >
            <img src={windIcon} alt="" className="h-4 w-4 object-contain" />
            <span className="font-sans text-[0.88rem] font-semibold text-[var(--ink)] group-hover:text-[var(--state)]">
              Ask Windy
            </span>
          </button>

          <button
            type="button"
            onClick={handleToggle}
            className="relative flex h-13 w-13 items-center justify-center rounded-full border-2 border-[var(--state)] bg-[var(--paper-raised)] p-2 shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[var(--state)]/20"
            aria-label="Open Windy"
          >
            <img src={windIcon} alt="Windy" className="h-full w-full object-contain filter drop-shadow-xs" />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--gold)] opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[var(--gold)]" />
              </span>
            )}
          </button>
        </div>
      )}

      {/* 
        Side Toggle Panel (covers 1/5th space of the website on desktop, 
        docked on the right, NO backdrop blur of normal site)
      */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Windy"
          className="fixed inset-y-0 right-0 z-40 flex h-full w-full sm:w-[340px] md:w-[360px] lg:w-1/5 lg:min-w-[310px] flex-col border-l border-[var(--rule-strong)] bg-[var(--paper-raised)] shadow-2xl transition-all duration-300 ease-in-out"
        >
          {/* Header - Themed Paper surface (NOT black, no green dot) */}
          <div className="flex items-center justify-between border-b border-[var(--rule)] bg-gradient-to-b from-[var(--paper-raised)] to-[var(--paper-deep)] px-4 py-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-1.5 shadow-xs">
                <img src={windIcon} alt="Windy" className="h-full w-full object-contain" />
              </div>
              <div>
                <span className="block font-sans text-[1.02rem] font-bold tracking-tight text-[var(--ink)]">
                  Windy
                </span>
                <p className="text-[0.72rem] text-[var(--text-muted)]">
                  Helps you explore forecasts and data easily
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleReset}
                title="Clear conversation"
                className="rounded-lg border border-transparent p-1.5 text-[var(--text-muted)] transition-colors hover:border-[var(--rule)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                aria-label="Clear chat history"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close Windy"
                className="rounded-lg border border-transparent p-1.5 text-[var(--text-muted)] transition-colors hover:border-[var(--rule)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                aria-label="Close Windy drawer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Messages Container (hidden scrollbars, full clarity) */}
          <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center space-y-5 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--rule)] bg-[var(--paper-deep)] p-2.5 shadow-xs">
                  <img src={windIcon} alt="Windy" className="h-full w-full object-contain" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-sans text-[1.12rem] font-bold text-[var(--ink)]">
                    Hello! I&apos;m Windy 🌬️
                  </h3>
                  <p className="text-[0.84rem] leading-relaxed text-[var(--text-muted)]">
                    I help you navigate wind forecasts, evaluate accuracy metrics, and check outturn data
                    easily.
                  </p>
                </div>

                <div className="w-full space-y-2 pt-2 text-left">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    Suggested Questions
                  </span>
                  <div className="flex flex-col gap-2">
                    {STARTER_PROMPTS.map((starter, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSend(starter.query)}
                        className="flex items-center justify-between gap-2.5 rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-3 text-left text-[0.82rem] font-medium text-[var(--text)] shadow-xs transition-all hover:border-[var(--state)] hover:bg-[var(--paper-deep)]"
                      >
                        <span className="line-clamp-2">{starter.label}</span>
                        <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--state)] opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--paper-deep)] p-1 mt-0.5 shadow-xs">
                    <img src={windIcon} alt="Windy" className="h-full w-full object-contain" />
                  </div>
                )}

                <div
                  className={`relative rounded-2xl px-3.5 py-2.5 shadow-xs text-[0.86rem] min-w-0 break-words ${
                    msg.role === "user"
                      ? "max-w-[85%] bg-[var(--state)] text-white rounded-br-none"
                      : "flex-1 max-w-[calc(100%-2.5rem)] bg-[var(--paper-deep)] border border-[var(--rule)] text-[var(--ink)] rounded-bl-none"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="min-w-0 max-w-full">
                      <MarkdownView content={msg.content} />

                      <div className="mt-1.5 flex justify-end text-[0.66rem] opacity-60 font-mono">
                        {msg.timestamp}
                      </div>

                      {/* Follow-up Action Chips */}
                      {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[var(--rule)] pt-2">
                          {msg.suggestedActions.map((action, aIdx) => (
                            <button
                              key={aIdx}
                              type="button"
                              onClick={() => handleSend(action.query)}
                              className="rounded-full border border-[var(--rule-strong)] bg-[var(--paper-raised)] px-2.5 py-1 text-[0.74rem] font-medium text-[var(--state)] shadow-xs transition-colors hover:border-[var(--state)] hover:bg-[var(--paper)]"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                      <div className="mt-1 text-right text-[0.66rem] opacity-75 font-mono">
                        {msg.timestamp}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking / Loading Animation (theme styled, no green dot) */}
            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--paper-deep)] p-1 shadow-xs">
                  <img src={windIcon} alt="Windy" className="h-full w-full object-contain animate-pulse" />
                </div>
                <div className="rounded-2xl border border-[var(--rule)] bg-[var(--paper-deep)] px-3.5 py-2 text-[0.82rem] text-[var(--text-muted)] flex items-center gap-2 shadow-xs">
                  <span className="flex h-2 w-2 rounded-full bg-[var(--state)] animate-ping" />
                  <span>Windy is analyzing...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="border-t border-[var(--rule)] bg-[var(--paper-raised)] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Windy about wind data, KPIs, or forecasts..."
                disabled={isLoading}
                className="flex-1 rounded-xl border border-[var(--rule-strong)] bg-[var(--paper)] px-3 py-2.5 text-[0.86rem] text-[var(--ink)] placeholder-[var(--text-faint)] focus:border-[var(--state)] focus:outline-none focus:ring-2 focus:ring-[var(--state)]/20 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="flex h-9.5 w-9.5 items-center justify-center rounded-xl bg-[var(--state)] text-white shadow-xs transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}
