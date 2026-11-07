import { useState } from "react";
import { bannerDue, snoozeBanner } from "../install/installState";
import { useInstallApp } from "../install/useInstallApp";
import { Button, IconButton } from "./Button";
import { Icon } from "./Icon";
import "./InstallBanner.css";

/**
 * Suggests adding the app to the home screen, from the second visit on. Like the match
 * banner it floats over the deck without taking focus, so a swipe carries on under it.
 */
export function InstallBanner(): JSX.Element | null {
  const { worthSuggesting, platform, install } = useInstallApp();
  // Read once: the banner shouldn't appear mid-visit just because a timer passed.
  const [due] = useState(() => bannerDue(Date.now()));
  const [hidden, setHidden] = useState(false);

  if (!due || hidden || !worthSuggesting) return null;

  const notNow = (): void => {
    snoozeBanner(Date.now());
    setHidden(true);
  };

  // Either way they've answered: a refused prompt, or steps they can follow from the
  // drawer later. iOS can't tell us they finished, so asking again would only nag.
  const accept = async (): Promise<void> => {
    snoozeBanner(Date.now());
    setHidden(true);
    await install();
  };

  return (
    <div className="md-install-banner" role="status" aria-label="Install the app">
      <img className="md-install-banner__icon" src="/icon-192.png" alt="" width="36" height="36" />
      <p className="md-install-banner__text">
        <strong className="md-install-banner__headline">Install Movie Date</strong>
        Open it from your home screen.
      </p>
      <Button className="md-install-banner__action" onClick={() => void accept()}>{platform === "ios" ? "Show me" : "Install"}</Button>
      <IconButton label="Not now" onClick={notNow}>
        <Icon name="close" />
      </IconButton>
    </div>
  );
}
