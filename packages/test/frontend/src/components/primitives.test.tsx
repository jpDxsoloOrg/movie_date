import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Card } from "@movie-date/frontend/components/Card";
import { Chip } from "@movie-date/frontend/components/Chip";
import { PageHeader } from "@movie-date/frontend/components/PageHeader";
import { PosterCollage } from "@movie-date/frontend/components/PosterCollage";
import { SegmentedControl } from "@movie-date/frontend/components/SegmentedControl";
import { Sheet } from "@movie-date/frontend/components/Sheet";
import { Skeleton, SkeletonChoices, SkeletonPosterGrid } from "@movie-date/frontend/components/Skeleton";
import { EmptyState } from "@movie-date/frontend/components/StateMessage";
import { Tile } from "@movie-date/frontend/components/Tile";
import { fakeViewport } from "../support/viewport";

afterEach(() => vi.unstubAllGlobals());

describe("PageHeader", () => {
  it("is an h2 inside a screen, under the page's own h1", () => {
    render(<PageHeader title="Filters" subtitle="Narrow it down" eyebrow="Tonight" actions={<button>Clear</button>} />);

    expect(screen.getByRole("heading", { level: 2, name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("Narrow it down")).toBeInTheDocument();
    expect(screen.getByText("Tonight")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders as the element asked for, with its heading and action", () => {
    render(
      <Card as="section" title="Link Plex" subtitle="Requests" action={<button>Edit</button>} aria-label="plex">
        body
      </Card>,
    );
    const card = screen.getByRole("region", { name: "plex" });

    expect(within(card).getByRole("heading", { name: "Link Plex" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(card).toHaveTextContent("body");
  });

  it("has no header row without a title or action", () => {
    const { container } = render(<Card>body</Card>);
    expect(container.querySelector(".md-card__header")).toBeNull();
  });
});

describe("Chip", () => {
  it("is plain text with no handlers", () => {
    render(<Chip label="Comedy" />);
    expect(screen.getByText("Comedy")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("toggles, exposing its pressed state", async () => {
    const onClick = vi.fn();
    render(<Chip label="Comedy" selected onClick={onClick} />);
    const chip = screen.getByRole("button", { name: "Comedy" });

    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("names its remove button after the chip", async () => {
    const onRemove = vi.fn();
    render(<Chip label="Tom Hanks" onRemove={onRemove} />);

    await userEvent.click(screen.getByRole("button", { name: "Remove Tom Hanks" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("never nests a button in a button when both handlers are given", () => {
    render(<Chip label="Tom Hanks" onClick={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("Tile", () => {
  it("is named by its label, with the logo decorative", async () => {
    const onClick = vi.fn();
    const { container } = render(<Tile label="Netflix" imageUrl="/icons/netflix.png" selected onClick={onClick} />);
    const tile = screen.getByRole("button", { name: "Netflix" });

    expect(tile).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    await userEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("doesn't fire when disabled", async () => {
    const onClick = vi.fn();
    render(<Tile label="Netflix" disabled onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Netflix" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("SegmentedControl", () => {
  const OPTIONS = [
    { value: "movies", label: "Movies" },
    { value: "shows", label: "Shows" },
    { value: "both", label: "Both" },
  ] as const;

  function Harness(): JSX.Element {
    const [value, setValue] = useState<(typeof OPTIONS)[number]["value"]>("movies");
    return <SegmentedControl label="Mode" options={OPTIONS} value={value} onChange={setValue} />;
  }

  it("is a labelled radio group with one tab stop", () => {
    render(<Harness />);

    expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Movies" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Movies" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Shows" })).toHaveAttribute("tabindex", "-1");
  });

  it("selects on click", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("radio", { name: "Shows" }));
    expect(screen.getByRole("radio", { name: "Shows" })).toBeChecked();
  });

  it("moves with the arrow keys, wrapping at the ends and taking focus along", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    screen.getByRole("radio", { name: "Movies" }).focus();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "Both" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Both" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Movies" })).toBeChecked();
  });
});

describe("Sheet", () => {
  class FakePointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }

  it("is labelled by a visible title, with a footer outside the scrolling body", () => {
    render(
      <Sheet open onClose={vi.fn()} title="Filter by service" actions={<button>Apply</button>}>
        body
      </Sheet>,
    );
    const sheet = screen.getByRole("dialog", { name: "Filter by service" });

    expect(within(sheet).getByRole("heading", { name: "Filter by service" })).toBeInTheDocument();
    expect(sheet.querySelector(".md-sheet__body")).not.toContainElement(screen.getByRole("button", { name: "Apply" }));
  });

  it("can't be dragged away as a dialog, where there's no handle to see", () => {
    fakeViewport(1280);
    vi.stubGlobal("PointerEvent", FakePointerEvent);
    window.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;
    HTMLElement.prototype.setPointerCapture = vi.fn();
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} label="Details">
        body
      </Sheet>,
    );
    const panel = screen.getByRole("dialog", { name: "Details" });
    const header = panel.querySelector(".md-sheet__header") as HTMLElement;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ height: 500 } as DOMRect);

    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientY: 0 });
    fireEvent.pointerMove(header, { pointerId: 1, clientY: 300 });
    fireEvent.pointerUp(header, { pointerId: 1, clientY: 300 });

    expect(panel.style.transform).toBe("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the same element when the viewport crosses over, so a trailer keeps playing", () => {
    const viewport = fakeViewport(390);
    render(
      <Sheet open onClose={vi.fn()} label="Details">
        <iframe title="player" />
      </Sheet>,
    );
    const player = screen.getByTitle("player");

    act(() => viewport.resize(1280));

    expect(screen.getByTitle("player")).toBe(player);
  });
});

describe("skeletons", () => {
  it("announces grids once and hides the shapes", () => {
    render(<SkeletonPosterGrid count={3} />);
    const status = screen.getByRole("status", { name: "Loading" });
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it("stands in for chips or tiles", () => {
    const { container } = render(<SkeletonChoices count={2} shape="tile" />);
    expect(container.querySelectorAll(".md-skeleton--tile")).toHaveLength(2);
  });

  it("takes a caller's size class", () => {
    const { container } = render(<Skeleton shape="poster" className="mine" />);
    expect(container.firstChild).toHaveClass("md-skeleton--poster", "mine");
  });
});

describe("EmptyState", () => {
  it("keeps its icon out of the accessible text", () => {
    render(<EmptyState title="No matches yet" icon="heart" />);
    expect(screen.getByRole("heading", { name: "No matches yet" })).toBeInTheDocument();
    expect(document.querySelector(".md-state__icon svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("PosterCollage", () => {
  it("is hidden from assistive tech, and lazy, so it can't delay the form", () => {
    const { container } = render(<PosterCollage />);
    const images = [...container.querySelectorAll("img")];

    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(images.length).toBeGreaterThan(12);
    for (const image of images) {
      expect(image).toHaveAttribute("alt", "");
      expect(image).toHaveAttribute("loading", "lazy");
      expect(image.getAttribute("src")).toMatch(/^https:\/\/image\.tmdb\.org\//);
    }
  });
});
