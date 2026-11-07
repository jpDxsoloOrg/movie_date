import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../services/api";
import { signIn } from "../services/auth";
import { validateLoginPassword, validateRequired } from "../services/validation";
import { AuthLayout } from "./AuthLayout";

export default function Login(): JSX.Element {
  const { state } = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const emailError = submitted ? validateRequired(email.trim()) : null;
  // The old form validated this field as you typed, the email only on submit.
  const passwordError = passwordTouched || submitted ? validateLoginPassword(password) : null;

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    if (validateRequired(email.trim()) || validateLoginPassword(password)) return;
    setSubmitting(true);
    try {
      // PublicOnly routes away as soon as this signs in.
      await signIn(email, password);
    } catch (error) {
      toast.error(errorMessage(error));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <form className="md-auth__form" onSubmit={(event) => void submit(event)} noValidate>
        <TextField
          label="EMAIL"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          error={emailError}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="PASSWORD"
          type="password"
          autoComplete="current-password"
          value={password}
          error={passwordError}
          onChange={(event) => {
            setPassword(event.target.value);
            setPasswordTouched(true);
          }}
        />
        <Button type="submit" variant="brand" block loading={submitting}>
          LOG IN
        </Button>
      </form>
      <Link className="md-auth__link" to="/forgot-password" state={state}>
        Forgot password?
      </Link>
      <Link className="md-auth__link" to="/register" state={state}>
        No account yet? Sign up.
      </Link>
    </AuthLayout>
  );
}
