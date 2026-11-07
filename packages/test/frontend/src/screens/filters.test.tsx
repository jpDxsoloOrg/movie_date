import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  genres: vi.fn(),
  searchPeople: vi.fn(),
  updateFilters: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: {
    genres: mocks.genres,
    searchPeople: mocks.searchPeople,
    updateFilters: mocks.updateFilters,
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong"),
}));

import { RoomContext, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import ActorSearch from "@movie-date/frontend/screens/ActorSearch";
import Filters from "@movie-date/frontend/screens/Filters";
import type { Person, Room } from "@movie-date/frontend/services/api";

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
    filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
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
const genreField = () => screen.findByRole("button", { name: /^Genres/ });
const actorField = () => screen.getByRole("button", { name: /^Actors/ });
const path = () => screen.getByTestId("path").textContent;

async function pickGenres(...names: string[]): Promise<void> {
  await userEvent.click(await genreField());
  for (const name of names) await userEvent.click(screen.getByRole("button", { name }));
  await userEvent.click(screen.getByRole("button", { name: "Apply" }));
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
});

afterEach(() => vi.useRealTimers());

describe("Filters: loading the form", () => {
  it("shows a skeleton until the genres arrive", async () => {
    mocks.genres.mockReturnValue(new Promise(() => undefined));
    renderFilters();
    expect(screen.getByRole("status", { name: "Loading genres" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Genres/ })).not.toBeInTheDocument();
  });

  it("offers a retry when genres fail, and leaves the rest of the form usable", async () => {
    mocks.genres.mockRejectedValueOnce(new Error("TMDB is down"));
    renderFilters();

    expect(await screen.findByText("TMDB is down")).toBeInTheDocument();
    expect(actorField()).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await genreField()).toBeInTheDocument();
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

    expect(await genreField()).toHaveAccessibleName("Genres Comedy, Drama");
    expect(actorField()).toHaveAccessibleName("Actors Tom Hanks");
    expect(screen.getByRole("button", { name: "Remove Netflix" })).toBeInTheDocument();
    expect(screen.getByLabelText("Start")).toHaveValue("2020-02-03");
    expect(screen.getByLabelText("End")).toHaveValue("2021-04-05");
  });

  it("follows a roommate's save until the form is edited, then keeps the edits", async () => {
    renderFilters();
    await genreField();

    const roommateSaved = (genreIds: number[]) =>
      makeRoom({ filters: { ...makeRoom().filters, genreIds } });
    replaceRoom(roommateSaved([28]));
    await waitFor(async () => expect(await genreField()).toHaveAccessibleName("Genres Action"));

    await pickGenres("Comedy");
    replaceRoom(roommateSaved([18]));
    await waitFor(async () => expect(await genreField()).toHaveAccessibleName("Genres Action, Comedy"));
  });

  it("drops edits made for a room the person has since left", async () => {
    renderFilters();
    await pickGenres("Comedy");

    replaceRoom(makeRoom({ id: "another-room" }));
    await waitFor(async () => expect(await genreField()).toHaveAccessibleName("Genres Any genre"));
  });
});

describe("Filters: genres", () => {
  it("filters the list by search and applies several genres", async () => {
    renderFilters();
    await userEvent.click(await genreField());

    await userEvent.type(screen.getByLabelText("Search genres"), "COM");
    expect(screen.getByRole("button", { name: "Comedy" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Action" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Comedy" }));
    expect(screen.getByRole("button", { name: "Comedy" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.clear(screen.getByLabelText("Search genres"));
    await userEvent.click(screen.getByRole("button", { name: "Action" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(await genreField()).toHaveAccessibleName("Genres Action, Comedy");
  });

  it("says so when nothing matches the search", async () => {
    renderFilters();
    await userEvent.click(await genreField());
    await userEvent.type(screen.getByLabelText("Search genres"), "zzz");
    expect(screen.getByText("No genres found")).toBeInTheDocument();
  });

  it("has an empty state when TMDB returns no genres", async () => {
    mocks.genres.mockResolvedValue([]);
    renderFilters();
    await userEvent.click(await genreField());
    expect(screen.getByText("No genres available")).toBeInTheDocument();
  });

  it("discards dialog changes on Cancel", async () => {
    renderFilters();
    await userEvent.click(await genreField());
    await userEvent.click(screen.getByRole("button", { name: "Action" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await genreField()).toHaveAccessibleName("Genres Any genre");
  });
});

describe("Filters: streaming services", () => {
  const openServices = () => userEvent.click(screen.getByRole("button", { name: "Streaming Services" }));
  const option = (name: string) => screen.getByRole("checkbox", { name });

  it("starts on Any, with icons for each option", async () => {
    renderFilters();
    await openServices();

    expect(option("Any")).toBeChecked();
    const netflixRow = option("Netflix").closest("label");
    expect(netflixRow?.querySelector("img")).toHaveAttribute("src", "/icons/netflix.png");
  });

  it("choosing a service unticks Any, and Any clears the services", async () => {
    renderFilters();
    await openServices();

    await userEvent.click(option("Netflix"));
    await userEvent.click(option("Hulu"));
    expect(option("Any")).not.toBeChecked();
    expect(screen.getByRole("list", { name: "Selected streaming services" })).toHaveTextContent("Hulu");

    await userEvent.click(option("Any"));
    expect(option("Any")).toBeChecked();
    expect(option("Netflix")).not.toBeChecked();
    expect(screen.queryByRole("list", { name: "Selected streaming services" })).not.toBeInTheDocument();
  });

  it("removes a service from its chip", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, services: ["netflix", "hulu"] } }));
    await userEvent.click(screen.getByRole("button", { name: "Remove Netflix" }));

    expect(screen.queryByRole("button", { name: "Remove Netflix" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Hulu" })).toBeInTheDocument();
  });

  it("treats a stored any marker as no restriction, and saves it as empty", async () => {
    renderFilters(makeRoom({ filters: { ...makeRoom().filters, services: ["any", "netflix"] } }));
    await openServices();
    expect(option("Any")).toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0].services).toEqual([]);
  });
});

describe("Filters: saving", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 7) });
  });

  it("defaults the start date to Jan 1 this year, saves, applies the room and goes home", async () => {
    renderFilters();
    await pickGenres("Drama");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Home screen")).toBeInTheDocument();
    expect(mocks.updateFilters).toHaveBeenCalledWith(
      expect.objectContaining({ genreIds: [18], cast: [], services: [], releaseDateGte: "2026-01-01" }),
    );
    expect(setRoom).toHaveBeenCalledWith(
      expect.objectContaining({ filters: expect.objectContaining({ genreIds: [18] }) }),
    );
  });

  it("keeps a picked start date", async () => {
    renderFilters();
    await genreField();
    await userEvent.type(screen.getByLabelText("Start"), "1999-03-31");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await screen.findByText("Home screen");
    expect(mocks.updateFilters.mock.calls[0]?.[0].releaseDateGte).toBe("1999-03-31");
  });

  it("refuses an end date before the start, counting the default start", async () => {
    renderFilters();
    await genreField();
    await userEvent.type(screen.getByLabelText("End"), "2025-06-01");
    expect(screen.getByLabelText("End")).toBeInvalid();

    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(mocks.updateFilters).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Start"), "2025-01-01");
    expect(screen.getByLabelText("End")).toBeValid();
  });

  it("stays on the form with its edits and shows the error when saving fails", async () => {
    mocks.updateFilters.mockRejectedValueOnce(new Error("Dates must be in YYYY-MM-DD format."));
    renderFilters();
    await pickGenres("Drama");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Dates must be in YYYY-MM-DD format.")).toBeInTheDocument();
    expect(path()).toBe("/filters");
    expect(setRoom).not.toHaveBeenCalled();
    expect(await genreField()).toHaveAccessibleName("Genres Drama");
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("Clear Filters empties the whole form, without saving", async () => {
    renderFilters(
      makeRoom({
        filters: {
          genreIds: [35],
          cast: [hanks],
          services: ["netflix"],
          releaseDateGte: "2020-02-03",
          releaseDateLte: "2021-04-05",
        },
      }),
    );
    await genreField();
    await userEvent.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(await genreField()).toHaveAccessibleName("Genres Any genre");
    expect(actorField()).toHaveAccessibleName("Actors Any actor");
    expect(screen.queryByRole("button", { name: "Remove Netflix" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Start")).toHaveValue("");
    expect(screen.getByLabelText("End")).toHaveValue("");
    expect(mocks.updateFilters).not.toHaveBeenCalled();
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
    await userEvent.click(actorField());
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

    expect(await genreField()).toHaveAccessibleName("Genres Drama");
    expect(actorField()).toHaveAccessibleName("Actors Tom Hanks");
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

    await userEvent.click(await screen.findByRole("button", { name: "Search" }));
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0]).toMatchObject({ genreIds: [18], cast: [hanks] });
  });

  it("goes straight back when nothing changed, keeping form edits", async () => {
    renderFilters();
    await pickGenres("Drama");
    await openActorsFromFilters();

    await userEvent.click(backArrow());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await genreField()).toHaveAccessibleName("Genres Drama");
  });

  it("prompts from the back arrow; Save and Exit keeps the actors", async () => {
    renderFilters();
    await genreField();
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(backArrow());
    await userEvent.click(within(await prompt()).getByRole("button", { name: "Save and Exit" }));

    await genreField();
    expect(actorField()).toHaveAccessibleName("Actors Tom Hanks");
  });

  it("Exit Without Saving drops the actors but not the earlier form edits", async () => {
    renderFilters();
    await pickGenres("Drama");
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(backArrow());
    await userEvent.click(within(await prompt()).getByRole("button", { name: "Exit Without Saving" }));

    expect(await genreField()).toHaveAccessibleName("Genres Drama");
    expect(actorField()).toHaveAccessibleName("Actors Any actor");
  });

  it("catches the browser back button too", async () => {
    renderFilters();
    await genreField();
    await openActorsFromFilters();
    await addHanks();

    await userEvent.click(screen.getByRole("button", { name: "Browser back" }));
    const dialog = await prompt();
    expect(path()).toBe("/filters/actors");

    await userEvent.click(within(dialog).getByRole("button", { name: "Exit Without Saving" }));
    await genreField();
    expect(path()).toBe("/filters");
  });

  it("dismissing the prompt stays put, and browser back still prompts afterwards", async () => {
    renderFilters();
    await genreField();
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

    await genreField();
    expect(actorField()).toHaveAccessibleName("Actors Tom Hanks");
  });
});
