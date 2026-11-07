import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { ModeSwitch } from "@movie-date/frontend/components/ModeSwitch";
import { ModeProvider } from "@movie-date/frontend/mode/ModeProvider";

function Screen(): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div key={pathname}>
      <ModeSwitch />
      <p data-testid="path">{pathname}</p>
      <p data-testid="navigation">{useNavigationType()}</p>
    </div>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ModeProvider>
        <Routes>
          <Route path="*" element={<Screen />} />
        </Routes>
      </ModeProvider>
    </MemoryRouter>,
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => localStorage.clear());

describe("ModeSwitch", () => {
  it("shows the current mode", () => {
    renderAt("/shows");
    expect(radio("Shows")).toBeChecked();
    expect(radio("Movies")).not.toBeChecked();
  });

  it("is named for what it picks between", () => {
    renderAt("/");
    expect(screen.getByRole("radiogroup", { name: "Movies or shows" })).toBeInTheDocument();
  });

  it("goes to Shows and back to Movies, without being bounced home", async () => {
    renderAt("/");
    const user = userEvent.setup();

    await user.click(radio("Shows"));
    expect(screen.getByTestId("path")).toHaveTextContent("/shows");

    await user.click(radio("Movies"));
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
    expect(radio("Movies")).toBeChecked();
  });

  it("replaces the history entry, so Back leaves rather than flips", async () => {
    renderAt("/");
    await userEvent.click(radio("Shows"));
    expect(screen.getByTestId("navigation")).toHaveTextContent("REPLACE");
  });

  it("does nothing for the mode already on", async () => {
    renderAt("/");
    await userEvent.click(radio("Movies"));
    expect(screen.getByTestId("navigation")).toHaveTextContent("POP");
  });

  it("keeps keyboard focus through the remount a new path brings", async () => {
    renderAt("/");
    const user = userEvent.setup();
    radio("Movies").focus();

    await user.keyboard("{ArrowRight}");

    await waitFor(() => expect(radio("Shows")).toHaveFocus());
  });

  it("doesn't take focus on an ordinary visit", () => {
    renderAt("/shows");
    expect(document.body).toHaveFocus();
  });
});
