import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon, type IconName } from "../components/Icon";
import { inviteQrDataUrl } from "../components/room/inviteQr";
import { Skeleton } from "../components/Skeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { useToast } from "../hooks/useToast";
import { useInstallApp } from "../install/useInstallApp";
import "./Install.css";

interface Step {
  icon: IconName;
  text: string;
}

const IOS_STEPS: readonly Step[] = [
  {
    icon: "iosShare",
    text: "Tap the Share button. On a newer iPhone, tap the ••• button at the bottom right first, then Share. On an iPad, Share is at the top.",
  },
  { icon: "addBox", text: "Scroll down the list and tap Add to Home Screen." },
  { icon: "check", text: "Tap Add. Movie Date is now on your home screen, next to your other apps." },
];

const ANDROID_STEPS: readonly Step[] = [
  { icon: "more", text: "Open your browser's menu. In Chrome it's the three dots at the top right." },
  { icon: "install", text: "Tap Install app, or Add to Home screen." },
  { icon: "check", text: "Tap Install. Movie Date is now with your other apps." },
];

function Steps({ steps }: { steps: readonly Step[] }): JSX.Element {
  return (
    <ol className="install__steps">
      {steps.map((step, index) => (
        <li key={step.text} className="install__step">
          <span className="install__step-number" aria-hidden="true">
            {index + 1}
          </span>
          <Icon name={step.icon} className="install__step-icon" />
          <span>{step.text}</span>
        </li>
      ))}
    </ol>
  );
}

function PhoneQr(): JSX.Element {
  const link = window.location.origin;
  const { data } = useAsyncData(() => inviteQrDataUrl(link), [link]);
  if (!data) return <Skeleton shape="rect" className="install__qr" />;
  return <img className="install__qr" src={data} alt={`QR code for ${link}`} />;
}

export default function Install(): JSX.Element {
  const toast = useToast();
  const { installed, canPrompt, platform, install } = useInstallApp();

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      toast.success("Link copied. Paste it into Safari.");
    } catch {
      toast.error("Couldn't copy the link. It's " + window.location.host);
    }
  };

  if (installed) {
    return (
      <div className="install">
        <Card variant="raised" title="You're all set">
          <p>Movie Date is installed. Open it from your home screen any time.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="install">
      <p className="install__lead">
        Put Movie Date on your home screen and it opens full screen, like any other app. Nothing to download from an app
        store.
      </p>

        <Card variant="raised">
          <Button block className="md-install-app-button" onClick={() => void install()}>
      {canPrompt && (
        <Card variant="raised">
          <Button block onClick={() => void install()}>
            Install Movie Date
          </Button>
        </Card>
      )}

      {!canPrompt && platform === "ios" && (
        <Card variant="raised" title="On iPhone or iPad">
          <Steps steps={IOS_STEPS} />
          <p className="install__note">
            Don't see Add to Home Screen? You may be inside another app, like Instagram or Gmail. Copy the link and open it
            in Safari.
          </p>
          <Button variant="secondary" onClick={() => void copyLink()}>
            Copy link
          </Button>
        </Card>
      )}

      {!canPrompt && platform === "android" && (
        <Card variant="raised" title="On Android">
          <Steps steps={ANDROID_STEPS} />
          <p className="install__note">
            No Install option? Open this page in Chrome. If it says Open in app instead, it's already installed.
          </p>
        </Card>
      )}

      {!canPrompt && platform === "desktop" && (
        <Card variant="raised" title="On a computer">
          <p>
            In Chrome or Edge, look for the install button at the right of the address bar. In Safari on a Mac, choose
            File, then Add to Dock.
          </p>
          <p className="install__note">Or scan this with your phone's camera to open Movie Date there:</p>
          <PhoneQr />
        </Card>
      )}
    </div>
  );
}
