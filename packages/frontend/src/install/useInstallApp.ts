import { useCallback, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import {
  currentPlatform,
  getInstallSnapshot,
  promptInstall,
  subscribeInstall,
  type InstallPlatform,
} from "./installState";

export const INSTALL_PATH = "/install";

export interface InstallApp {
  installed: boolean;
  canPrompt: boolean;
  platform: InstallPlatform;
  /** iOS can always add to the home screen; elsewhere only a ready prompt is worth a banner. */
  worthSuggesting: boolean;
  /** One tap where the browser allows it, otherwise the steps on the Install page. */
  install: () => Promise<void>;
}

export function useInstallApp(): InstallApp {
  const { installed, canPrompt } = useSyncExternalStore(subscribeInstall, getInstallSnapshot);
  const navigate = useNavigate();
  const platform = currentPlatform();

  const install = useCallback(async (): Promise<void> => {
    if (getInstallSnapshot().canPrompt) {
      await promptInstall();
      return;
    }
    navigate(INSTALL_PATH);
  }, [navigate]);

  return {
    installed,
    canPrompt,
    platform,
    worthSuggesting: !installed && (canPrompt || platform === "ios"),
    install,
  };
}
