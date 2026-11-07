import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { MatchHistory } from "../components/match/MatchHistory";
import { SwipeHistory } from "../components/match/SwipeHistory";
import { SegmentedControl } from "../components/SegmentedControl";
import { useMode } from "../mode/ModeProvider";
import { MODE_COPY } from "../mode/modeCopy";
import type { MediaType } from "../services/api";
import "./History.css";

const TABS = [
  { id: "matches", label: "Matches" },
  { id: "swipes", label: "My Swipes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const MEDIA_OPTIONS: readonly { value: MediaType; label: string }[] = [
  { value: "MOVIE", label: MODE_COPY.MOVIE.switchLabel },
  { value: "TV", label: MODE_COPY.TV.switchLabel },
];

const MEDIA_PARAM_SHOWS = "shows";
const MEDIA_PARAM_MOVIES = "movies";

function mediaFromParam(param: string | null, fallback: MediaType): MediaType {
  if (param === MEDIA_PARAM_SHOWS) return "TV";
  return param === MEDIA_PARAM_MOVIES ? "MOVIE" : fallback;
}

export default function History(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { mode: currentMode } = useMode();
  const activeTab: TabId = searchParams.get("tab") === "swipes" ? "swipes" : "matches";
  const mediaType = mediaFromParam(searchParams.get("media"), currentMode);
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  /** The tabs share the page's scroller, so the other list would open at this one's offset. */
  function scrollToTop(): void {
    const scroller = tabRefs.current.get(activeTab)?.closest(".md-page__content");
    if (scroller) scroller.scrollTop = 0;
  }

  function selectMedia(next: MediaType): void {
    if (next === mediaType) return;
    setSearchParams(
      (current) => {
        current.set("media", next === "TV" ? MEDIA_PARAM_SHOWS : MEDIA_PARAM_MOVIES);
        return current;
      },
      { replace: true },
    );
    scrollToTop();
  }

  function selectTab(tab: TabId): void {
    if (tab === activeTab) return;
    setSearchParams(
      (current) => {
        current.set("tab", tab);
        return current;
      },
      { replace: true },
    );
    scrollToTop();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab = activeTab === "matches" ? "swipes" : "matches";
    selectTab(nextTab);
    tabRefs.current.get(nextTab)?.focus();
  }

  return (
    <div className="history md-page-wide">
      <div className="history__media">
        <SegmentedControl label="Show history for" options={MEDIA_OPTIONS} value={mediaType} onChange={selectMedia} block />
      </div>
      <div className="history__tabs" role="tablist" aria-label="History" onKeyDown={handleKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) tabRefs.current.set(tab.id, element);
            }}
            type="button"
            role="tab"
            id={`history-tab-${tab.id}`}
            className="history__tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`history-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Both stay mounted so switching tabs keeps loaded pages. The key swaps them for
          the other mode's, which has its own lists. */}
      <div
        id="history-panel-matches"
        role="tabpanel"
        aria-labelledby="history-tab-matches"
        className="history__panel"
        hidden={activeTab !== "matches"}
      >
        <MatchHistory key={mediaType} mediaType={mediaType} />
      </div>
      <div
        id="history-panel-swipes"
        role="tabpanel"
        aria-labelledby="history-tab-swipes"
        className="history__panel"
        hidden={activeTab !== "swipes"}
      >
        <SwipeHistory key={mediaType} mediaType={mediaType} />
      </div>
    </div>
  );
}
