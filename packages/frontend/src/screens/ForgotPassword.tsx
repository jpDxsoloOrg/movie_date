import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../services/api";
import { confirmForgotPassword, forgotPassword } from "../services/auth";
import { validateConfirmPassword, validateNewPassword, validateRequired } from "../services/validation";
import { AuthLayout } from "./AuthLayout";

export default function ForgotPassword(): JSX.Element {
  const { state } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    email: validateRequired(email.trim()),
    code: validateRequired(code.trim()),
    password: validateNewPassword(password),
    confirmPassword: validateConfirmPassword(confirmPassword, password),
  };

  const sendCode = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.email) return;
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSubmitted(false);
      setStep("reset");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.code || errors.password || errors.confirmPassword) return;
    setSubmitting(true);
    try {
      await confirmForgotPassword(email, code, password);
      toast.success("Password updated. Log in with your new password.");
      navigate("/login", { replace: true, state });
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      {step === "email" ? (
        <form className="md-auth__form" onSubmit={(event) => void sendCode(event)} noValidate>
          <p className="md-auth__note">Enter your email and we'll send you a reset code.</p>
          <TextField
            label="EMAIL"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            error={submitted ? errors.email : null}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="brand" block loading={submitting}>
            Send Code
          </Button>
        </form>
      ) : (
        <form className="md-auth__form" onSubmit={(event) => void resetPassword(event)} noValidate>
          <p className="md-auth__note">If {email.trim()} has an account, a code is on its way.</p>
          <TextField
            label="CODE"
            autoComplete="one-time-code"
            inputMode="numeric"
            value={code}
            error={submitted ? errors.code : null}
            onChange={(event) => setCode(event.target.value)}
          />
          <TextField
            label="NEW PASSWORD"
            type="password"
            autoComplete="new-password"
            value={password}
            error={submitted ? errors.password : null}
            onChange={(event) => setPassword(event.target.value)}
          />
          <TextField
            label="CONFIRM PASSWORD"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            error={submitted ? errors.confirmPassword : null}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <Button type="submit" variant="brand" block loading={submitting}>
            Reset Password
          </Button>
        </form>
      )}
      <Link className="md-auth__link" to="/login" state={state}>
        Back to Login
      </Link>
    </AuthLayout>
  );
}
