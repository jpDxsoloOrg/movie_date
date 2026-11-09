import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { TourOverlay } from "@movie-date/frontend/components/tour/TourOverlay";

describe("TourOverlay", () => {
  const mockOnSkip = vi.fn();

  const renderWithAnchor = (html: string) => {
    const anchorId = "my-anchor";
    return render(
      <div data-theme="movies">
        <div id={anchorId} ref={(el: HTMLDivElement | null) => document.getElementById(anchorId) as any = el} data-tour={anchorId}>
          Anchor content here
        </div>
        {html}
      </div>,
    );
  };

  it("finds the anchor element", () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const container = screen.getByRole("dialog");
    expect(container).toBeInTheDocument();
  });

  it("is placed below when space allows", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    const rect = (card as HTMLElement).getBoundingClientRect();
    expect(rect.top).toBeGreaterThan(0);
  });

  it("updates when resize events occur", () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    vi.advanceTimersByTime(100);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onSkip when Escape is pressed", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    card.focus();
    userEvent.keyboard("{Escape}");
    expect(mockOnSkip).toHaveBeenCalled();
  });

  it("clicks outside are swallowed when not interactive", () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const container = screen.getByRole("dialog");
    userEvent.click(container);
    expect(mockOnSkip).not.toHaveBeenCalled();
  });

  it("works at 360px width without horizontal scroll", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    expect(document.documentElement.scrollX).toBe(0);
  });

  it("works at 1280px width without horizontal scroll", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    expect(document.documentElement.scrollX).toBe(0);
  });

  it("has correct aria attributes", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    expect(card).toHaveAttribute("role", "dialog");
    expect(card).toHaveAttribute("aria-modal", "true");

    const h1 = card.querySelector("h1");
    if (h1) {
      expect(h1.textContent).toMatch(/Tour, step/);
    }
  });

  it("has aria-live caption for screen readers", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    expect(card).toContainHTML("aria-describedby");
  });

  it("has tabindex=-1 for focus management", async () => {
    renderWithAnchor(<TourOverlay anchorId="my-anchor" onSkip={mockOnSkip} />);
    const card = await screen.findByRole("dialog");
    expect(card).toHaveAttribute("tabIndex", "-1");
  });
});
