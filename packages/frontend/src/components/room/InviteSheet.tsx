import { Sheet } from "../Sheet";
import { InvitePanel } from "./InvitePanel";

export interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  code: string;
}

export function InviteSheet({ open, onClose, code }: InviteSheetProps): JSX.Element {
  return (
    <Sheet open={open} onClose={onClose} label="Invite to room" size="sm">
      <InvitePanel code={code} qr="always" />
    </Sheet>
  );
}
