import { useNavigate } from "react-router-dom";
import { revokeSessions, signOut } from "../services/auth";

export function useLogOut(): () => Promise<void> {
  const navigate = useNavigate();

  return async () => {
    await revokeSessions();
    signOut();
    // Before the auth guard sees the sign-out, or it saves this page as the return path.
    navigate("/login", { replace: true });
  };
}
