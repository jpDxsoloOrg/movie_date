/**
 * Shared tour actions that work across steps. Each step's before/after uses these to open/close UI.
 */
import { useContext } from "react";
import { DrawerContext, type DrawerContextValue } from "../../context/DrawerContext";
import { SheetContext, type SheetContextValue } from "../../context/BottomSheetContext";
import { InviteContext, type InviteContextValue } from "../../context/InviteContext";

export const useTutorialContext = (): TutorialContext => {
  const drawerCtx = useContext(DrawerContext);
  const sheetCtx = useContext(SheetContext);
  const inviteCtx = useContext(InviteContext);

  if (!drawerCtx || !sheetCtx || !inviteCtx) {
    throw new Error("Tour context: must be used inside TourProvider which wraps all providers");
  }

  return {
    openDrawer: () => drawerCtx.setOpen(true),
    closeDrawer: () => drawerCtx.setOpen(false),
    openDetailsSheet: () => sheetCtx.open("details"),
    closeDetailsSheet: () => sheetCtx.close(),
    openInviteSheet: () => inviteCtx.setOpen(true),
    closeInviteSheet: () => inviteCtx.setOpen(false),
  };
};

export interface TutorialContext {
  openDrawer(): void;
  closeDrawer(): void;
  openDetailsSheet(): void;
  closeDetailsSheet(): void;
  openInviteSheet(): void;
  closeInviteSheet(): void;
}
