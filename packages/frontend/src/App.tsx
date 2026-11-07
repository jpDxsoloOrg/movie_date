import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";
import { AuthProvider } from "./context/AuthProvider";
import { ToastProvider } from "./context/ToastProvider";

export function App(): JSX.Element {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
