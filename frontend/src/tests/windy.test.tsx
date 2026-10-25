import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownView } from "../components/windy/MarkdownView";
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

describe("WindyWidget", () => {
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
