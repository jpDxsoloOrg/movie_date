import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  genres: vi.fn(),
  searchPeople: vi.fn(),
  updateFilters: vi.fn(),
  filterPreview: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: {
    genres: mocks.genres,
    searchPeople: mocks.searchPeople,
    updateFilters: mocks.updateFilters,
    filterPreview: mocks.filterPreview,
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong"),
}));

import { RoomContext, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import ActorSearch from "@movie-date/frontend/screens/ActorSearch";
import Filters from "@movie-date/frontend/screens/Filters";
import type { Person, Room } from "@movie-date/frontend/services/api";
import { fakeViewport } from "../support/viewport";

const hanks: Person = { id: 31, name: "Tom Hanks", profileUrl: "https://img/hanks.jpg", knownForDepartment: "Acting" };
const holland: Person = { id: 32, name: "Tom Holland", profileUrl: "https://img/holland.jpg", knownForDepartment: "Acting" };
const noPhoto: Person = { id: 33, name: "Tom Nobody", profileUrl: null, knownForDepartment: "Acting" };

const GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
];

// Unsaved drafts live in a module and are keyed by room, so this keeps tests apart.
let roomNumber = 0;

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: `room-${roomNumber}`,
    code: "ABC234",
    matchThreshold: 2,
    requireMajority: false,
    round: 1,
    tvRound: 1,
    plexAvailable: false,
    filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
    tvFilters: { genreIds: [], services: [], cast: [] },
    members: [],
    ...overrides,
  };
}

const setRoom = vi.fn();
let replaceRoom: (room: Room) => void = () => undefined;

function Harness({ initialRoom }: { initialRoom: Room }): JSX.Element {
  const [room, setRoomState] = useState(initialRoom);
  replaceRoom = setRoomState;
  const value = { room, setRoom } as unknown as RoomContextValue;
  return (
    <RoomContext.Provider value={value}>
      <AppUnderTest />
    </RoomContext.Provider>
  );
}

function BrowserChrome(): JSX.Element {
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="path">{useLocation().pathname}</div>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

function AppUnderTest(): JSX.Element {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<p>Home screen</p>} />
        <Route path="/filters" element={<Filters />} />
        <Route path="/filters/actors" element={<ActorSearch />} />
      </Routes>
      <BrowserChrome />
    </ToastProvider>
  );
}

function renderAt(initialEntries: string[], room = makeRoom()) {
  return render(
    <MemoryRouter
      initialEntries={initialEntries}
      initialIndex={initialEntries.length - 1}
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
    >
      <Harness initialRoom={room} />
    </MemoryRouter>,
  );
}

const renderFilters = (room?: Room) => renderAt(["/", "/filters"], room);
const genreGroup = () => screen.findByRole("group", { name: "Genres" });
const actorBox = () => screen.getByRole("combobox", { name: "Search actors" });
const fullActorSearch = () => screen.getByRole("button", { name: "Full actor search" });
const applyButton = () => screen.getByRole("button", { name: "Apply" });
const activeFilters = () => screen.getByRole("region", { name: "Active filters" });
const path = () => screen.getByTestId("path").textContent;

async function pickGenres(...names: string[]): Promise<void> {
  const group = await genreGroup();
  for (const name of names) await userEvent.click(within(group).getByRole("button", { name }));
}

async function expectGenres(...names: string[]): Promise<void> {
  const chips = within(await genreGroup()).getAllByRole("button");
  const pressed = chips.filter((chip) => chip.getAttribute("aria-pressed") === "true");
  expect(pressed.map((chip) => chip.textContent)).toEqual(names);
}

function expectActors(...names: string[]): void {
  const list = screen.queryByRole("list", { name: "Selected actors" });
  const shown = list ? within(list).getAllByRole("listitem") : [];
  expect(shown.map((item) => item.textContent)).toEqual(names);
}

async function searchFor(text: string): Promise<void> {
  await userEvent.type(screen.getByLabelText("Search Actor"), `${text}{Enter}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  roomNumber += 1;
  mocks.genres.mockResolvedValue(GENRES);
  mocks.searchPeople.mockResolvedValue([hanks, holland]);
  mocks.updateFilters.mockImplementation(async (filters: Room["filters"]) => makeRoom({ filters }));
  mocks.filterPreview.mockResolvedValue({ totalResults: 1234, posterUrls: ["https://img/one.jpg"] });
});

afterEach(() => vi.useRealTimers());

describe("Filters: loading the form", () => {
  it("shows chip-shaped skeletons until the genres arrive", async () => {
    mocks.genres.mockReturnValue(new Promise(() => undefined));
    renderFilters();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Genres" })).not.toBeInTheDocument();
  });

  it("offers a retry when genres fail, and leaves the rest of the form usable", async () => {
    mocks.genres.mockRejectedValueOnce(new Error("TMDB is down"));
    renderFilters();

    expect(await screen.findByText("TMDB is down")).toBeInTheDocument();
    expect(fullActorSearch()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await genreGroup()).toBeInTheDocument();
    expect(screen.queryByText("TMDB is down")).not.toBeInTheDocument();
  });

  it("shows the room's saved filters", async () => {
    renderFilters(
      makeRoom({
        filters: {
          genreIds: [35, 18],
          cast: [hanks],
          services: ["netflix"],
          releaseDateGte: "2020-02-03",
          releaseDateLte: "2021-04-05",
        },
      }),
    );

    await expectGenres("Comedy", "Drama");
    expectActors("Tom Hanks");
    expect(screen.getByRole("button", { name: "Netflix" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Start")).toHaveValue("2020-02-03");
    expect(screen.getByLabelText("End")).toHaveValue("2021-04-05");
  });

  it("follows a roommate's save until the form is edited, then keeps the edits", async () => {
    renderFilters();
    await genreGroup();

    const roommateSaved = (genreIds: number[]) =>
      makeRoom({ filters: { ...makeRoom().filters, genreIds } });
    act(() => replaceRoom(roommateSaved([28])));
    await expectGenres("Action");

    await pickGenres("Comedy");
    act(() => replaceRoom(roommateSaved([18])));
    await expectGenres("Action", "Comedy");
  });

  it("drops edits made for a room the person has since left", async () => {
    renderFilters();
    await pickGenres("Comedy");

    act(() => replaceRoom(makeRoom({ id: "another-room" })));
    await expectGenres();
  });
});

describe("Filters: layout", () => {
  let viewport: ReturnType<typeof fakeViewport> | null = null;
  afterEach(() => {
    viewport?.restore();
    viewport = null;
  });

  it("is a full-screen sheet on a phone, and closing it goes home without saving", async () => {
    renderFilters();
    await pickGenres("Comedy");

    const sheet = screen.getByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));

    expect(await screen.findByText("Home screen")).toBeInTheDocument();
    expect(mocks.updateFilters).not.toHaveBeenCalled();
  });

  it("is a page with a sticky bar on a tablet", async () => {
    viewport = fakeViewport(768);
    renderFilters();

    expect(await genreGroup()).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Preview" })).not.toBeInTheDocument();
    expect(applyButton()).toBeInTheDocument();
  });

  it("puts the preview, summary and Apply beside the form on a desktop", async () => {
    viewport = fakeViewport(1280);
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, genreIds: [35] } }));

    const ticket = await screen.findByRole("complementary", { name: "Preview" });
    expect(await within(ticket).findByText("About 1,234 movies")).toBeInTheDocument();
    expect(ticket.querySelector("img")).toHaveAttribute("src", "https://img/one.jpg");
    expect(await within(ticket).findByRole("button", { name: "Remove Comedy" })).toBeInTheDocument();
    expect(within(ticket).getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("keeps the draft when the window crosses a breakpoint", async () => {
    viewport = fakeViewport(1280);
    renderFilters();
    await pickGenres("Comedy");

    act(() => viewport?.resize(390));
    await expectGenres("Comedy");
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("keeps a half-typed actor and open Exact dates across the phone line and back", async () => {
    viewport = fakeViewport(1023);
    renderFilters();
    await genreGroup();
    await userEvent.type(actorBox(), "Tom Han");
    await userEvent.click(screen.getByText("Exact dates"));
    const exactDates = screen.getByText("Exact dates").closest("details");
    expect(exactDates).toHaveAttribute("open");

    act(() => viewport?.resize(639));
    expect(screen.getByRole("dialog", { name: "Filters" })).toContainElement(actorBox());
    expect(actorBox()).toHaveValue("Tom Han");
    expect(screen.getByText("Exact dates").closest("details")).toHaveAttribute("open");

    act(() => viewport?.resize(1024));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(actorBox()).toHaveValue("Tom Han");
    expect(screen.getByText("Exact dates").closest("details")).toHaveAttribute("open");
  });

  it("still submits and saves from the fields after they've moved", async () => {
    viewport = fakeViewport(1280);
    renderFilters();
    await pickGenres("Comedy");

    act(() => viewport?.resize(390));
    await pickGenres("Drama");
    await userEvent.click(applyButton());

    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalledTimes(1));
    expect(mocks.updateFilters.mock.calls[0]?.[0].genreIds).toEqual([35, 18]);
  });
});

describe("Filters: genres", () => {
  it("toggles chips in place, with no dialog", async () => {
    renderFilters();
    await pickGenres("Comedy", "Action");
    await expectGenres("Action", "Comedy");

    await pickGenres("Comedy");
    await expectGenres("Action");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("has an empty state when TMDB returns no genres", async () => {
    mocks.genres.mockResolvedValue([]);
    renderFilters();
    expect(await screen.findByText("No genres available")).toBeInTheDocument();
  });
});

describe("Filters: streaming services", () => {
  const tile = (name: string | RegExp) => screen.getByRole("button", { name });
  const expectPressed = (name: string | RegExp, pressed: boolean) =>
    expect(tile(name)).toHaveAttribute("aria-pressed", String(pressed));

  it("starts on Any, with a logo on each tile", async () => {
    renderFilters();

    expectPressed("Any", true);
    expect(tile("Netflix").querySelector("img")).toHaveAttribute("src", "/icons/netflix.png");
  });

  it("choosing a service unticks Any, and Any clears the services", async () => {
    renderFilters();

    await userEvent.click(tile("Netflix"));
    await userEvent.click(tile("Hulu"));
    expectPressed("Any", false);
    expect(activeFilters()).toHaveTextContent("Hulu");

    await userEvent.click(tile("Any"));
    expectPressed("Any", true);
    expectPressed("Netflix", false);
    expect(within(activeFilters()).queryByRole("button", { name: "Remove Hulu" })).not.toBeInTheDocument();
  });

  it("treats a stored any marker as no restriction, and saves it as empty", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, services: ["any", "netflix"] } }));
    expectPressed("Any", true);

    await userEvent.click(applyButton());
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0].services).toEqual([]);
  });

  it("offers Plex, with its own mark, only when a member has linked it", async () => {
    const { unmount } = renderFilters();
    expect(screen.queryByRole("button", { name: /^Plex/ })).not.toBeInTheDocument();
    unmount();

    renderFilters(makeRoom({ plexAvailable: true }));
    const plex = tile(/^Plex/);
    expect(plex.querySelector("svg.plex-mark")).toBeInTheDocument();

    await userEvent.click(plex);
    expectPressed(/^Plex/, true);
    await userEvent.click(applyButton());
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0].services).toEqual(["plex"]);
  });

  it("shows Any while a saved Plex filter has no linked member behind it", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, services: ["plex"] } }));

    expectPressed("Any", true);
    expect(within(activeFilters()).queryByRole("button", { name: "Remove Plex" })).not.toBeInTheDocument();
  });
});

describe("Filters: actor autocomplete", () => {
  const suggestion = (name: string) => screen.findByRole("option", { name });

  it("suggests as you type, after a pause, from two letters on", async () => {
    renderFilters();
    await userEvent.type(actorBox(), "t");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(mocks.searchPeople).not.toHaveBeenCalled();

    await userEvent.type(actorBox(), "om");
    expect(await suggestion("Tom Hanks")).toBeInTheDocument();
    expect(mocks.searchPeople).toHaveBeenCalledTimes(1);
    expect(mocks.searchPeople).toHaveBeenCalledWith("tom");
    expect(actorBox()).toHaveAttribute("aria-expanded", "true");
  });

  it("adds a click as a face chip, clears the box and keeps focus for the next name", async () => {
    renderFilters();
    await userEvent.type(actorBox(), "tom");
    await userEvent.click(await suggestion("Tom Hanks"));

    expectActors("Tom Hanks");
    expect(actorBox()).toHaveValue("");
    expect(actorBox()).toHaveFocus();
    const chips = screen.getByRole("list", { name: "Selected actors" });
    expect(chips.querySelector("img")).toHaveAttribute("src", hanks.profileUrl);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("removes an actor from their chip", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, cast: [hanks, holland] } }));
    const list = screen.getByRole("list", { name: "Selected actors" });
    await userEvent.click(within(list).getByRole("button", { name: "Remove Tom Hanks" }));
    expectActors("Tom Holland");
  });

  it("works from the keyboard, and Enter never submits the form", async () => {
    renderFilters();
    await userEvent.type(actorBox(), "tom");
    await suggestion("Tom Holland");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(actorBox().getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Tom Holland" }).id,
    );
    await userEvent.keyboard("{Enter}");

    expectActors("Tom Holland");
    expect(mocks.updateFilters).not.toHaveBeenCalled();
    expect(path()).toBe("/filters");
  });

  it("Escape closes the suggestions but not the sheet", async () => {
    renderFilters();
    await userEvent.type(actorBox(), "tom");
    await suggestion("Tom Hanks");

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(path()).toBe("/filters");
  });

  it("marks who's already in, and a second press takes them out", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, cast: [hanks] } }));
    await userEvent.type(actorBox(), "tom");

    const option = await suggestion("Tom Hanks");
    expect(option).toHaveAttribute("aria-selected", "true");
    await userEvent.click(option);
    expectActors();
  });

  it("hides people without a photo, and says when nobody's left", async () => {
    mocks.searchPeople.mockResolvedValue([noPhoto]);
    renderFilters();
    await userEvent.type(actorBox(), "nobody");

    expect(await screen.findByText("No actors found")).toBeInTheDocument();
    expect(screen.queryByText("Tom Nobody")).not.toBeInTheDocument();
  });

  it("offers a retry after an error", async () => {
    mocks.searchPeople.mockRejectedValueOnce(new Error("TMDB is down"));
    renderFilters();
    await userEvent.type(actorBox(), "tom");

    expect(await screen.findByText("TMDB is down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await suggestion("Tom Hanks")).toBeInTheDocument();
  });
});

describe("Filters: release dates", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 7) });
  });

  const pick = (name: string) => screen.getByRole("button", { name });
  const expectPressed = (name: string, pressed: boolean) =>
    expect(pick(name)).toHaveAttribute("aria-pressed", String(pressed));

  it("shows this year as the pick when nothing is chosen", () => {
    renderFilters();
    expectPressed("This year", true);
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("To")).toHaveValue("");
  });

  it("a decade fills the range, and a second one spans the years between", async () => {
    renderFilters();
    await userEvent.click(pick("1990s"));
    expect(screen.getByLabelText("Start")).toHaveValue("1990-01-01");
    expect(screen.getByLabelText("End")).toHaveValue("1999-12-31");

    await userEvent.click(pick("2010s"));
    expect(screen.getByLabelText("From")).toHaveValue("1990");
    expect(screen.getByLabelText("To")).toHaveValue("2019");
    expectPressed("2000s", true);
    expect(within(activeFilters()).getByText("1990–2019")).toBeInTheDocument();
  });

  it("the year boxes set whole years, and can reach before the quick picks", async () => {
    renderFilters();
    await userEvent.selectOptions(screen.getByLabelText("From"), "1955");
    await userEvent.selectOptions(screen.getByLabelText("To"), "1960");

    expect(screen.getByLabelText("Start")).toHaveValue("1955-01-01");
    expect(screen.getByLabelText("End")).toHaveValue("1960-12-31");
  });

  it("keeps plain date entry behind Exact dates, already open for a mid-year date", async () => {
    const { unmount } = renderFilters();
    const exact = () => screen.getByText("Exact dates").closest("details");
    expect(exact()).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Exact dates"));
    expect(exact()).toHaveAttribute("open");
    unmount();

    renderFilters(makeRoom({ filters: { ...makeRoom().filters, releaseDateGte: "1999-03-31" } }));
    expect(exact()).toHaveAttribute("open");
  });
});

describe("Filters: live count", () => {
  const appear = (text: string) => screen.findByText(text);

  it("counts what Apply would save, including the default start date", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 7) });
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, services: ["any"] } }));

    expect(await appear("About 1,234 movies")).toBeInTheDocument();
    expect(mocks.filterPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ services: [], releaseDateGte: "2026-01-01" }), "MOVIE");
  });

  it("waits for a pause, so a run of taps is one request", async () => {
    renderFilters();
    await appear("About 1,234 movies");
    mocks.filterPreview.mockClear();
    mocks.filterPreview.mockResolvedValue({ totalResults: 1, posterUrls: [] });

    await pickGenres("Action", "Comedy", "Drama");
    expect(await appear("About 1 movie")).toBeInTheDocument();
    expect(mocks.filterPreview).toHaveBeenCalledTimes(1);
    expect(mocks.filterPreview.mock.calls[0]?.[0].genreIds).toEqual([28, 35, 18]);
  });

  it("drops the count quietly when there isn't one, or the call fails", async () => {
    mocks.filterPreview.mockResolvedValueOnce({ totalResults: null, posterUrls: [] });
    const { unmount } = renderFilters();
    expect(await appear("Ready when you are")).toBeInTheDocument();
    unmount();

    mocks.filterPreview.mockRejectedValueOnce(new Error("TMDB is down"));
    renderFilters();
    expect(await appear("Ready when you are")).toBeInTheDocument();
    expect(screen.queryByText("TMDB is down")).not.toBeInTheDocument();
  });

  it.each([
    [20_001, "20,000+ movies"],
    [20_000, "20,000+ movies"],
    [20_301, "20,000+ movies"],
    [19_999, "About 19,999 movies"],
  ])("treats TMDB's ceiling as a floor: %i reads %s", async (totalResults, text) => {
    mocks.filterPreview.mockResolvedValue({ totalResults, posterUrls: [] });
    renderFilters();
    expect(await appear(text)).toBeInTheDocument();
  });

  it("says so when nothing matches", async () => {
    mocks.filterPreview.mockResolvedValue({ totalResults: 0, posterUrls: [] });
    renderFilters();
    expect(await appear("No movies match")).toBeInTheDocument();
  });
});

describe("Filters: active summary", () => {
  const filled = () =>
    makeRoom({
      filters: {
        genreIds: [35],
        cast: [hanks],
        services: ["netflix"],
        releaseDateGte: "1990-01-01",
        releaseDateLte: "1999-12-31",
      },
    });

  it("says a never-filtered room deals everything until Apply narrows it, without offering Clear All", async () => {
    renderFilters();
    expect(activeFilters()).toHaveTextContent("The deck has every movie for now");
    expect(activeFilters()).toHaveTextContent("narrows it to this year’s");
    expect(screen.queryByRole("button", { name: "Clear All" })).not.toBeInTheDocument();
  });

  it("says Apply deals this year's movies once clearing leaves a saved room empty", async () => {
    renderFilters(filled());
    await userEvent.click(await within(activeFilters()).findByRole("button", { name: "Clear All" }));
    expect(activeFilters()).toHaveTextContent("Nothing picked, so Apply deals this year’s movies");
  });

  it("doesn't count the default start date that saving filled in as a pick", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 7) });
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, releaseDateGte: "2026-01-01" } }));
    expect(activeFilters()).toHaveTextContent("Nothing picked");
  });

  it("removes each filter on its own", async () => {
    renderFilters(filled());
    await genreGroup();
    const summary = within(activeFilters());

    await userEvent.click(await summary.findByRole("button", { name: "Remove Comedy" }));
    await expectGenres();
    await userEvent.click(summary.getByRole("button", { name: "Remove Netflix" }));
    expect(screen.getByRole("button", { name: "Netflix" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(summary.getByRole("button", { name: "Remove Tom Hanks" }));
    expectActors();
    await userEvent.click(summary.getByRole("button", { name: "Remove 1990s" }));
    expect(screen.getByLabelText("Start")).toHaveValue("");
    expect(mocks.updateFilters).not.toHaveBeenCalled();
  });

  it("Clear All empties the whole form, without saving", async () => {
    renderFilters(filled());
    await genreGroup();
    await userEvent.click(screen.getByRole("button", { name: "Clear All" }));

    await expectGenres();
    expectActors();
    expect(screen.getByRole("button", { name: "Any" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Start")).toHaveValue("");
    expect(screen.getByLabelText("End")).toHaveValue("");
    expect(mocks.updateFilters).not.toHaveBeenCalled();
  });
});

describe("Filters: saving", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 7) });
  });

  it("defaults the start date to Jan 1 this year, saves, applies the room and goes home", async () => {
    renderFilters();
    await pickGenres("Drama");
    await userEvent.click(applyButton());

    expect(await screen.findByText("Home screen")).toBeInTheDocument();
    expect(mocks.updateFilters).toHaveBeenCalledWith(
      expect.objectContaining({ genreIds: [18], cast: [], services: [], releaseDateGte: "2026-01-01" }), "MOVIE");
    expect(setRoom).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ genreIds: [18] }) }),
    );
  });

  it("keeps a picked start date", async () => {
    renderFilters();
    await genreGroup();
    await userEvent.type(screen.getByLabelText("Start"), "1999-03-31");
    await userEvent.click(applyButton());

    await screen.findByText("Home screen");
    expect(mocks.updateFilters.mock.calls[0]?.[0].releaseDateGte).toBe("1999-03-31");
  });

  it("refuses an end date before the start, counting the default start", async () => {
    renderFilters();
    await genreGroup();
    await userEvent.type(screen.getByLabelText("End"), "2025-06-01");
    expect(screen.getByLabelText("End")).toBeInvalid();
    expect(screen.getByLabelText("To")).toBeInvalid();
    expect(screen.getByRole("alert")).toHaveTextContent("End date must be on or after Jan 1, 2026");

    expect(applyButton()).toBeDisabled();
    expect(screen.getByText("Check the release dates")).toBeInTheDocument();
    await userEvent.click(applyButton());
    expect(mocks.updateFilters).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Start"), "2025-01-01");
    expect(screen.getByLabelText("End")).toBeValid();
    expect(applyButton()).toBeEnabled();
  });

  it("stays on the form with its edits and shows the error when saving fails", async () => {
    mocks.updateFilters.mockRejectedValueOnce(new Error("Dates must be in YYYY-MM-DD format."));
    renderFilters();
    await pickGenres("Drama");
    await userEvent.click(applyButton());

    expect(await screen.findByText("Dates must be in YYYY-MM-DD format.")).toBeInTheDocument();
    expect(path()).toBe("/filters");
    expect(setRoom).not.toHaveBeenCalled();
    await expectGenres("Drama");
    expect(applyButton()).toBeEnabled();
  });
});

describe("ActorSearch: searching", () => {
  const renderActors = (room?: Room) => renderAt(["/filters", "/filters/actors"], room);

  it("prompts for a name before the first search", () => {
    renderActors();
    expect(screen.getByText("Search by name to find actors.")).toBeInTheDocument();
    expect(screen.getByText("No actors selected.")).toBeInTheDocument();
    expect(mocks.searchPeople).not.toHaveBeenCalled();
  });

  it("doesn't search while typing, only on Enter", async () => {
    renderActors();
    await userEvent.type(screen.getByLabelText("Search Actor"), "tom");
    expect(mocks.searchPeople).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Tom Hanks")).toBeInTheDocument();
    expect(mocks.searchPeople).toHaveBeenCalledWith("tom");
  });

  it("searches on blur", async () => {
    renderActors();
    await userEvent.type(screen.getByLabelText("Search Actor"), "  tom ");
    await userEvent.tab();

    expect(await screen.findByText("Tom Hanks")).toBeInTheDocument();
    expect(mocks.searchPeople).toHaveBeenCalledWith("tom");
  });

  it("searches once from the search icon, though clicking it also blurs the field", async () => {
    renderActors();
    await userEvent.type(screen.getByLabelText("Search Actor"), "tom");
    await userEvent.click(screen.getByRole("button", { name: "Search actors" }));

    expect(await screen.findByText("Tom Hanks")).toBeInTheDocument();
    expect(mocks.searchPeople).toHaveBeenCalledTimes(1);
  });

  it("shows a skeleton during a search", async () => {
    mocks.searchPeople.mockReturnValue(new Promise(() => undefined));
    renderActors();
    await searchFor("tom");
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("hides people without a photo, as the old app did", async () => {
    mocks.searchPeople.mockResolvedValue([hanks, noPhoto]);
    renderActors();
    await searchFor("tom");

    expect(await screen.findByText("Tom Hanks")).toBeInTheDocument();
    expect(screen.queryByText("Tom Nobody")).not.toBeInTheDocument();
  });

  it("says when nothing was found, including when nobody has a photo", async () => {
    mocks.searchPeople.mockResolvedValue([noPhoto]);
    renderActors();
    await searchFor("nobody");
    expect(await screen.findByText("No actors found")).toBeInTheDocument();
  });

  it("offers a retry after an error, and Enter retries too", async () => {
    mocks.searchPeople.mockRejectedValueOnce(new Error("TMDB is down"));
    mocks.searchPeople.mockRejectedValueOnce(new Error("Still down"));
    renderActors();
    await searchFor("tom");

    expect(await screen.findByText("TMDB is down")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Still down")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search Actor"), "{Enter}");
    expect(await screen.findByText("Tom Hanks")).toBeInTheDocument();
  });

  it("doesn't leave the last search's results up beside a new search's error", async () => {
    renderActors();
    await searchFor("tom");
    await screen.findByText("Tom Hanks");

    mocks.searchPeople.mockRejectedValueOnce(new Error("TMDB is down"));
    await userEvent.clear(screen.getByLabelText("Search Actor"));
    await searchFor("sigourney");

    expect(await screen.findByText("TMDB is down")).toBeInTheDocument();
    expect(screen.queryByText("Tom Hanks")).not.toBeInTheDocument();
  });

  it("adds and removes actors, without adding one twice", async () => {
    renderActors(makeRoom({ filters: { ...makeRoom().filters, cast: [holland] } }));
    await searchFor("tom");

    expect(await screen.findByRole("button", { name: "Added Tom Holland" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Add Tom Hanks" }));

    const selectedList = screen.getByRole("list", { name: "Selected actors" });
    expect(within(selectedList).getAllByRole("listitem")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Remove Tom Holland" }));
    expect(within(selectedList).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Add Tom Holland" })).toBeEnabled();
  });
});

describe("ActorSearch: leaving", () => {
  async function openActorsFromFilters(): Promise<void> {
    await userEvent.click(fullActorSearch());
    expect(path()).toBe("/filters/actors");
  }

  async function addHanks(): Promise<void> {
    await searchFor("tom");
    await userEvent.click(await screen.findByRole("button", { name: "Add Tom Hanks" }));
  }

  const backArrow = () => screen.getByRole("button", { name: "Back to filters" });
  const prompt = () => screen.findByRole("dialog", { name: "Unsaved Changes" });

  it("keeps unsaved form edits through the trip and merges the saved actors", async () => {
    renderFilters();
    await pickGenres("Drama");
    await userEvent.type(screen.getByLabelText("Start"), "2001-02-03");
    await openActorsFromFilters();

    await addHanks();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await expectGenres("Drama");
    expectActors("Tom Hanks");
    expect(screen.getByLabelText("Start")).toHaveValue("2001-02-03");
    expect(path()).toBe("/filters");
    expect(mocks.updateFilters).not.toHaveBeenCalled();
  });

  it("sends the merged form when Search follows", async () => {
    renderFilters();
    await pickGenres("Drama");
    await openActorsFromFilters();
    await addHanks();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0]).toMatchObject({ genreIds: [18], cast: [hanks] });
  });

  it("goes straight back when nothing changed, keeping form edits", async () => {
    renderFilters();
    await pickGenres("Drama");
    await openActorsFromFilters();

    await userEvent.click(backArrow());

    expect(screen.queryByRole("dialog", { name: "Unsaved Changes" })).not.toBeInTheDocument();
    await expectGenres("Drama");
  });

  it("prompts from the back arrow; Save and Exit keeps the actors", async () => {
    renderFilters();
    await genreGroup();
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(backArrow());
    await userEvent.click(within(await prompt()).getByRole("button", { name: "Save and Exit" }));

    await genreGroup();
    expectActors("Tom Hanks");
  });

  it("Exit Without Saving drops the actors but not the earlier form edits", async () => {
    renderFilters();
    await pickGenres("Drama");
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(backArrow());
    await userEvent.click(within(await prompt()).getByRole("button", { name: "Exit Without Saving" }));

    await expectGenres("Drama");
    expectActors();
  });

  it("catches the browser back button too", async () => {
    renderFilters();
    await genreGroup();
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(screen.getByRole("button", { name: "Browser back" }));
    const dialog = await prompt();
    expect(path()).toBe("/filters/actors");

    await userEvent.click(within(dialog).getByRole("button", { name: "Exit Without Saving" }));
    await genreGroup();
    expect(path()).toBe("/filters");
  });

  it("dismissing the prompt stays put, and browser back still prompts afterwards", async () => {
    renderFilters();
    await genreGroup();
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await prompt();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("list", { name: "Selected actors" })).toHaveTextContent("Tom Hanks");

    await userEvent.click(screen.getByRole("button", { name: "Browser back" }));
    await prompt();
    expect(path()).toBe("/filters/actors");
  });

  it("returns to filters when opened directly with no history behind it", async () => {
    renderAt(["/filters/actors"]);
    await addHanks();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await genreGroup();
    expectActors("Tom Hanks");
  });
});
