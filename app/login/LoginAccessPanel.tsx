"use client";

import { useActionState, useState } from "react";
import type { AuthActionState } from "@/app/actions/auth-account";
import { clearCachedNavigationSession } from "@/components/site/navigation-session-cache";

type AuthAction = (state: AuthActionState, formData: FormData) => Promise<AuthActionState>;

type LoginAccessPanelProps = {
  returnTo: string;
  signInAction: AuthAction;
  registrationAction: AuthAction;
  googleAction: () => Promise<void>;
};

const initialState: AuthActionState = {};

export default function LoginAccessPanel({
  returnTo,
  signInAction,
  registrationAction,
  googleAction,
}: LoginAccessPanelProps) {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [signInState, submitSignIn, signInPending] = useActionState(signInAction, initialState);
  const [registrationState, submitRegistration, registrationPending] = useActionState(
    registrationAction,
    initialState,
  );
  const isRegistering = mode === "register";

  return (
    <>
      <div className="auth-heading">
        <h1>{isRegistering ? "Create account" : "Sign in"}</h1>
        <p>
          {isRegistering
            ? "Create your SUPERCAR DASH profile and start building your digital garage."
            : "Use your SUPERCAR DASH account to manage your garage and transactions."}
        </p>
      </div>

      <div className="auth-form-stack">
        {isRegistering ? (
          <form action={submitRegistration} className="auth-form" key="register" onSubmit={clearCachedNavigationSession}>
            <strong>Register</strong>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input name="username" type="text" placeholder="Username" aria-label="Username" autoComplete="off" required />
            <input name="email" type="email" placeholder="Email" aria-label="Email" autoComplete="off" required />
            <input
              name="password"
              type="password"
              placeholder="Password (10+ characters)"
              aria-label="Password"
              autoComplete="new-password"
              minLength={10}
              required
            />
            <input
              name="confirmPassword"
              type="password"
              placeholder="Confirm password"
              aria-label="Confirm password"
              autoComplete="new-password"
              minLength={10}
              required
            />
            {registrationState.error ? (
              <p className="auth-form-error" role="alert" aria-live="polite">
                {registrationState.error}
              </p>
            ) : null}
            <button type="submit" className="garage-primary-button" disabled={registrationPending}>
              {registrationPending ? "Creating account..." : "Create account"}
            </button>
          </form>
        ) : (
          <form action={submitSignIn} className="auth-form" key="signin" onSubmit={clearCachedNavigationSession}>
            <strong>Account login</strong>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input
              name="identifier"
              type="text"
              placeholder="Username or email"
              aria-label="Username or email"
              autoComplete="off"
              required
            />
            <input
              name="password"
              type="password"
              placeholder="Password"
              aria-label="Password"
              autoComplete="off"
              required
            />
            {signInState.error ? (
              <p className="auth-form-error" role="alert" aria-live="polite">
                {signInState.error}
              </p>
            ) : null}
            <button type="submit" className="garage-primary-button" disabled={signInPending}>
              {signInPending ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        <button
          type="button"
          className="auth-mode-toggle"
          onClick={() => setMode(isRegistering ? "signin" : "register")}
        >
          {isRegistering ? "Already have an account? Sign in" : "New to SUPERCAR DASH? Register"}
        </button>

        <div className="auth-divider">
          <span />
          <span>or</span>
          <span />
        </div>
        <form action={googleAction} onSubmit={clearCachedNavigationSession}>
          <button type="submit" className="auth-google-button">
            Continue with Google
          </button>
        </form>
      </div>
    </>
  );
}
