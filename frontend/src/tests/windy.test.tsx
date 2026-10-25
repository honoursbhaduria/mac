import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MarkdownView } from "../components/windy/MarkdownView";
import { getChatFromCookies, saveChatToCookies } from "../components/windy/WindyWidget";
import type { WindyMessage } from "../types/windy";
import { renderInShell } from "./render";

describe("MarkdownView", () => {
  it("renders headers and inline formatting using react-markdown", () => {
    const md = `### Accuracy Overview
This is **bold text** and \`inline code\`.`;
    render(<MarkdownView content={md} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Accuracy Overview");
    expect(screen.getByText("bold text")).toBeInTheDocument();
    expect(screen.getByText("inline code")).toBeInTheDocument();
  });

  it("renders markdown tables properly with remark-gfm", () => {
    const md = `| Metric | Value |
|---|---|
| MAE | 1932 MW |
| WAPE | 14.7% |`;
    render(<MarkdownView content={md} />);
    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.getByText("1932 MW")).toBeInTheDocument();
    expect(screen.getByText("14.7%")).toBeInTheDocument();
  });
});

describe("WindyWidget Cookie Persistence", () => {
  beforeEach(() => {
    // Clear cookies before each test
    document.cookie = "windy_chat_history=; path=/; max-age=0";
  });

  it("saves messages to cookies and reads them back", () => {
    const testMessages: WindyMessage[] = [
      { id: "u-1", role: "user", content: "What is MAE?", timestamp: "10:00" },
      { id: "a-1", role: "assistant", content: "MAE is Mean Absolute Error.", timestamp: "10:01" },
    ];
    saveChatToCookies(testMessages);
    expect(document.cookie).toContain("windy_chat_history=");

    const retrieved = getChatFromCookies();
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0]?.content).toBe("What is MAE?");
    expect(retrieved[1]?.content).toBe("MAE is Mean Absolute Error.");
  });

  it("clears cookies when empty messages array is saved", () => {
    const testMessages: WindyMessage[] = [
      { id: "u-1", role: "user", content: "Test message", timestamp: "10:00" },
    ];
    saveChatToCookies(testMessages);
    expect(getChatFromCookies()).toHaveLength(1);

    saveChatToCookies([]);
    expect(getChatFromCookies()).toHaveLength(0);
  });
});

describe("WindyWidget", () => {
  beforeEach(() => {
    document.cookie = "windy_chat_history=; path=/; max-age=0";
  });

  it("renders floating launcher and toggles open/close", async () => {
    renderInShell(<div data-testid="page-content" />);
    const launcher = screen.getByLabelText("Open Windy");
    expect(launcher).toBeInTheDocument();

    // Open chat
    fireEvent.click(launcher);
    expect(screen.getByRole("dialog", { name: "Windy" })).toBeInTheDocument();
    expect(screen.getByText(/Hello! I'm Windy/i)).toBeInTheDocument();
    expect(screen.getByText(/Helps you explore forecasts and data easily/i)).toBeInTheDocument();

    // Close chat
    const closeBtn = screen.getByLabelText("Close Windy drawer");
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
