import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../services/api";
import { signUp } from "../services/auth";
import { validateConfirmPassword, validateNewPassword, validateRequired } from "../services/validation";
import { AuthLayout } from "./AuthLayout";

export default function Register(): JSX.Element {
  const { state } = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    email: validateRequired(email.trim()),
    password: validateNewPassword(password),
    confirmPassword: validateConfirmPassword(confirmPassword, password),
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitted(true);
    if (errors.email || errors.password || errors.confirmPassword) return;
    setSubmitting(true);
    try {
      await signUp(email, password);
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
          error={submitted ? errors.email : null}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="PASSWORD"
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
          Register
        </Button>
      </form>
      <Link className="md-auth__link" to="/login" state={state}>
        Back to Login
      </Link>
    </AuthLayout>
  );
}
