import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@movie-date/frontend/services/auth", () => ({ signOut: vi.fn(), revokeSessions: vi.fn() }));

import { Drawer } from "@movie-date/frontend/components/Drawer";
import { InstallBanner } from "@movie-date/frontend/components/InstallBanner";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import {
  BANNER_SNOOZE_MS,
  bannerDue,
  detectPlatform,
  promptInstall,
  recordVisit,
  VISIT_GAP_MS,
  resetInstallState,
  setDeferredPromptForTest,
  startInstallCapture,
  type BeforeInstallPromptEvent,
} from "@movie-date/frontend/install/installState";
import Install from "@movie-date/frontend/screens/Install";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function useUserAgent(userAgent: string, touchPoints = 0): void {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  // jsdom has no maxTouchPoints to spy on.
  Object.defineProperty(navigator, "maxTouchPoints", { value: touchPoints, configurable: true });
}

function fakePrompt(outcome: "accepted" | "dismissed"): BeforeInstallPromptEvent {
  const event = new Event("beforeinstallprompt") as BeforeInstallPromptEvent;
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

const DAY = 24 * 60 * 60 * 1000;

/** The banner waits for a second visit, counted a day apart here. */
function visit(times: number): void {
  for (let index = 0; index < times; index += 1) recordVisit(index * DAY + 1);
}

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderAt(ui: JSX.Element, path = "/"): void {
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
        <Path />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  resetInstallState();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("detectPlatform", () => {
  it("knows iPhones, iPads that claim to be Macs, Android and the rest", () => {
    expect(detectPlatform(IPHONE, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 5)).toBe("ios");
    expect(detectPlatform(IPAD_AS_MAC, 0)).toBe("desktop");
    expect(detectPlatform(ANDROID, 5)).toBe("android");
    expect(detectPlatform(WINDOWS, 0)).toBe("desktop");
  });
});

describe("InstallBanner", () => {
  it("waits for the second visit", () => {
    useUserAgent(IPHONE, 5);
    visit(1);
    renderAt(<InstallBanner />);
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("on an iPhone, Show me opens the steps", async () => {
    useUserAgent(IPHONE, 5);
    visit(2);
    renderAt(<InstallBanner />);

    await userEvent.click(screen.getByRole("button", { name: "Show me" }));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/install$/);
  });

  it("where the browser has a prompt, Install opens it in one tap and the banner goes once accepted", async () => {
    useUserAgent(ANDROID, 5);
    visit(2);
    const prompt = fakePrompt("accepted");
    setDeferredPromptForTest(prompt);
    renderAt(<InstallBanner />);

    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(prompt.prompt).toHaveBeenCalledOnce();
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("doesn't come back next visit after the browser's prompt is turned down", async () => {
    useUserAgent(ANDROID, 5);
    visit(2);
    setDeferredPromptForTest(fakePrompt("dismissed"));
    const first = render(
      <MemoryRouter>
        <InstallBanner />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Install" }));
    first.unmount();

    // Chrome offers the prompt again on the next load.
    setDeferredPromptForTest(fakePrompt("dismissed"));
    render(
      <MemoryRouter>
        <InstallBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it.each([
    ["desktop", WINDOWS, 0],
    ["Android", ANDROID, 5],
  ])("stays away on %s when the browser can't install", (_name, userAgent, touchPoints) => {
    useUserAgent(userAgent, touchPoints);
    visit(2);
    renderAt(<InstallBanner />);
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("stays away when already running from the home screen", () => {
    useUserAgent(IPHONE, 5);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }));
    resetInstallState();
    visit(2);
    renderAt(<InstallBanner />);
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
  });

  it("Not now hides it for 30 days", async () => {
    useUserAgent(IPHONE, 5);
    visit(2);
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const first = render(
      <MemoryRouter>
        <InstallBanner />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
    first.unmount();

    vi.spyOn(Date, "now").mockReturnValue(now + BANNER_SNOOZE_MS - 1);
    const soon = render(
      <MemoryRouter>
        <InstallBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status", { name: "Install the app" })).not.toBeInTheDocument();
    soon.unmount();

    vi.spyOn(Date, "now").mockReturnValue(now + BANNER_SNOOZE_MS);
    render(
      <MemoryRouter>
        <InstallBanner />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status", { name: "Install the app" })).toBeInTheDocument();
  });
});

describe("visits", () => {
  it("counts a return after the gap, but not reloads or a second tab the same evening", () => {
    const start = 1_800_000_000_000;
    recordVisit(start);
    recordVisit(start + 60_000);
    recordVisit(start + VISIT_GAP_MS - 1);
    expect(bannerDue(start + VISIT_GAP_MS)).toBe(false);
    recordVisit(start + VISIT_GAP_MS);
    expect(bannerDue(start + VISIT_GAP_MS)).toBe(true);
  });
});

describe("remembered install", () => {
  it("knows it's installed in a browser tab after running from the home screen, until the browser offers it again", () => {
    useUserAgent(ANDROID, 5);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }));
    resetInstallState();
    vi.unstubAllGlobals();

    // A normal tab later: the flag is set, and the remembered install still counts.
    setDeferredPromptForTest(null);
    renderAt(<Install />, "/install");
    expect(screen.getByRole("heading", { name: "You're all set" })).toBeInTheDocument();
  });

  it("forgets it once the browser offers to install again, because that means it was removed", async () => {
    useUserAgent(ANDROID, 5);
    localStorage.setItem("installSeenStandalone", "true");
    startInstallCapture();
    act(() => {
      const event = fakePrompt("dismissed");
      window.dispatchEvent(event);
    });
    renderAt(<Install />, "/install");
    expect(screen.getByRole("button", { name: "Install Movie Date" })).toBeInTheDocument();
    expect(localStorage.getItem("installSeenStandalone")).toBeNull();
    await promptInstall();
  });
});

describe("Drawer", () => {
  it("offers Install App, and drops it once installed", async () => {
    useUserAgent(IPHONE, 5);
    const onClose = vi.fn();
    renderAt(<Drawer open onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Install App" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/install$/);

    startInstallCapture();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button", { name: "Install App" })).not.toBeInTheDocument();
  });
});

describe("Install screen", () => {
  it("walks an iPhone through Share and Add to Home Screen, with a way out of in-app browsers", () => {
    useUserAgent(IPHONE, 5);
    renderAt(<Install />, "/install");

    expect(screen.getByRole("heading", { name: "On iPhone or iPad" })).toBeInTheDocument();
    expect(screen.getByText(/Tap the Share button/)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("gives Android the browser menu steps when there's no prompt", () => {
    useUserAgent(ANDROID, 5);
    renderAt(<Install />, "/install");
    expect(screen.getByRole("heading", { name: "On Android" })).toBeInTheDocument();
  });

  it("shows one install button when the browser has a prompt", async () => {
    useUserAgent(WINDOWS);
    const prompt = fakePrompt("dismissed");
    setDeferredPromptForTest(prompt);
    renderAt(<Install />, "/install");

    await userEvent.click(screen.getByRole("button", { name: "Install Movie Date" }));
    expect(prompt.prompt).toHaveBeenCalledOnce();
  });

  it("offers a QR code for the phone on a computer that can't install", async () => {
    useUserAgent(WINDOWS);
    renderAt(<Install />, "/install");
    expect(screen.getByRole("heading", { name: "On a computer" })).toBeInTheDocument();
    expect(await screen.findByRole("img", { name: /QR code for/ })).toBeInTheDocument();
  });

  it("says so when it's already installed", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(display-mode: standalone)" }));
    useUserAgent(IPHONE, 5);
    resetInstallState();
    renderAt(<Install />, "/install");
    expect(screen.getByRole("heading", { name: "You're all set" })).toBeInTheDocument();
  });
});
