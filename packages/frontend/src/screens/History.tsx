import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { MatchHistory } from "../components/match/MatchHistory";
import { SwipeHistory } from "../components/match/SwipeHistory";
import "./History.css";

const TABS = [
  { id: "matches", label: "Matches" },
  { id: "swipes", label: "My Swipes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function History(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabId = searchParams.get("tab") === "swipes" ? "swipes" : "matches";
  const tabRefs = useRef(new Map<TabId, HTMLButtonElement>());

  function selectTab(tab: TabId): void {
    if (tab === activeTab) return;
    setSearchParams({ tab }, { replace: true });
    // The tabs share the page's scroller, so the other list would open at this one's offset.
    const scroller = tabRefs.current.get(tab)?.closest(".md-page__content");
    if (scroller) scroller.scrollTop = 0;
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
      {/* Both stay mounted so switching tabs keeps loaded pages. */}
      <div
        id="history-panel-matches"
        role="tabpanel"
        aria-labelledby="history-tab-matches"
        className="history__panel"
        hidden={activeTab !== "matches"}
      >
        <MatchHistory />
      </div>
      <div
        id="history-panel-swipes"
        role="tabpanel"
        aria-labelledby="history-tab-swipes"
        className="history__panel"
        hidden={activeTab !== "swipes"}
      >
        <SwipeHistory />
      </div>
    </div>
  );
}
