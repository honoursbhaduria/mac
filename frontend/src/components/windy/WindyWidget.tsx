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
  { label: "Why 24h lead time?", query: "Why is the decision lead time 24 hours and how does it prevent hindsight bias?" },
  { label: "Why WAPE over MAPE?", query: "Why does this platform use WAPE instead of MAPE for wind scoring?" },
];

const PRESET_WIDTHS = [
  { label: "1/5", width: 330, title: "Compact (approx. 1/5th screen width)" },
  { label: "Std", width: 480, title: "Standard view (480px)" },
  { label: "Wide", width: 680, title: "Wide view (680px)" },
];

export function WindyWidget() {
  const { filters } = useFilters();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<WindyMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);

  // Desktop user-adjustable panel width (persisted in localStorage)
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("windy_panel_width");
      if (saved) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 280 && parsed <= 950) return parsed;
      }
      return Math.min(460, Math.max(330, Math.round(window.innerWidth * 0.22)));
    }
    return 360;
  });

  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

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

  // Drag-to-resize logic in website (desktop) view
  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeRef.current = {
        startX: e.clientX,
        startWidth: panelWidth,
      };
    },
    [panelWidth]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;
      // Dragging left increases width; dragging right decreases width
      const deltaX = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(
        Math.max(280, resizeRef.current.startWidth + deltaX),
        Math.min(950, Math.round(window.innerWidth * 0.75))
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false);
        resizeRef.current = null;
        localStorage.setItem("windy_panel_width", String(panelWidth));
      }
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing, panelWidth]);

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
      {/* Floating Toggle Launcher (visible when closed) */}
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
            className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--state)] bg-[var(--paper-raised)] p-2 shadow-xl transition-transform duration-200 hover:scale-105 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[var(--state)]/20"
            aria-label="Open Windy"
          >
            <img
              src={windIcon}
              alt="Windy"
              className="h-full w-full object-contain filter drop-shadow-xs"
            />
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
        Mobile Backdrop: ONLY rendered on mobile (<640px)
        Desktop website view has NO backdrop and NO blur, keeping the dashboard interactive!
      */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] transition-opacity duration-200 sm:hidden"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* 
        Windy Chat Section:
        - Mobile: floating popup modal card (inset-x-3 bottom-3 top-12 rounded-2xl)
        - Desktop: docked right-side panel with user-adjustable width (drag handle on left)
      */}
      {isOpen && (
        <aside
          role="dialog"
          aria-label="Windy"
          className={`fixed inset-x-3 bottom-3 top-12 z-50 flex flex-col rounded-2xl border border-[var(--rule-strong)] bg-[var(--paper-raised)] shadow-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:bottom-0 sm:z-40 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l ${
            isResizing ? "transition-none select-none" : "transition-all duration-200 ease-out"
          }`}
          style={
            {
              // Custom CSS property used exclusively by desktop media query
              "--panel-width": `${panelWidth}px`,
              width: "var(--panel-width, 100%)",
            } as React.CSSProperties
          }
        >
          {/* Draggable Resizer Bar on Left Edge (Desktop website view only) */}
          <div
            onMouseDown={startResizing}
            className="group absolute -left-2.5 top-0 bottom-0 z-50 hidden sm:flex w-5 cursor-col-resize items-center justify-center transition-colors hover:bg-[var(--state)]/15 active:bg-[var(--state)]/30"
            title="Drag left/right to resize Windy"
          >
            <div
              className={`h-16 w-1 rounded-full transition-all duration-150 ${
                isResizing
                  ? "bg-[var(--state)] scale-y-125 shadow-sm"
                  : "bg-[var(--rule-strong)] group-hover:bg-[var(--state)] group-hover:scale-y-110"
              }`}
            />
            {/* Live resize width tooltip pill while dragging */}
            {isResizing && (
              <div className="absolute right-6 top-1/2 -translate-y-1/2 rounded-md bg-[var(--ink)] px-2 py-1 font-mono text-[0.72rem] text-white shadow-lg pointer-events-none">
                {panelWidth}px
              </div>
            )}
          </div>

          {/* Mobile Sheet Grabber Pill (Mobile popup modal only) */}
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--rule-strong)] sm:hidden" />

          {/* Header - Themed Paper surface (Not black, follows theme) */}
          <div className="flex items-center justify-between border-b border-[var(--rule)] bg-gradient-to-b from-[var(--paper-raised)] to-[var(--paper-deep)] px-4 py-3 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--rule)] bg-[var(--paper-raised)] p-1.5 shadow-xs">
                <img src={windIcon} alt="Windy" className="h-full w-full object-contain" />
              </div>
              <div className="min-w-0">
                <span className="block font-sans text-[1.02rem] font-bold tracking-tight text-[var(--ink)]">
                  Windy
                </span>
                <p className="truncate text-[0.72rem] text-[var(--text-muted)]">
                  Helps you explore forecasts and data easily
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Desktop Width Presets */}
              <div className="hidden sm:flex items-center gap-1 mr-1 border-r border-[var(--rule)] pr-2">
                {PRESET_WIDTHS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setPanelWidth(preset.width);
                      localStorage.setItem("windy_panel_width", String(preset.width));
                    }}
                    title={preset.title}
                    className={`rounded px-1.5 py-0.5 text-[0.68rem] font-semibold transition-colors ${
                      Math.abs(panelWidth - preset.width) < 30
                        ? "bg-[var(--state)] text-white shadow-xs"
                        : "text-[var(--text-muted)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

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
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages Container (hidden scrollbars, smooth touch scroll on mobile) */}
          <div className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center space-y-5 py-5 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--rule)] bg-[var(--paper-deep)] p-2.5 shadow-xs">
                  <img src={windIcon} alt="Windy" className="h-full w-full object-contain" />
                </div>
                <div className="space-y-1 max-w-[420px]">
                  <h3 className="font-sans text-[1.12rem] font-bold text-[var(--ink)]">
                    Hello! I&apos;m Windy 🌬️
                  </h3>
                  <p className="text-[0.84rem] leading-relaxed text-[var(--text-muted)]">
                    I help you navigate wind forecasts, evaluate accuracy metrics, and check outturn data easily.
                  </p>
                </div>

                <div className="w-full space-y-2 pt-2 text-left">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                    Suggested Questions
                  </span>
                  <div className={`grid grid-cols-1 ${panelWidth >= 520 ? "sm:grid-cols-2" : "grid-cols-1"} gap-2`}>
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
                  className={`relative rounded-2xl px-3.5 py-2.5 shadow-xs text-[0.86rem] min-w-0 overflow-hidden break-words ${
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

            {/* Thinking / Loading Animation */}
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--state)] text-white shadow-xs transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
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
