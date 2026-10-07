import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });
    setBusy(false);
    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    const callbackUrl = router.query.callbackUrl;
    const destination =
      typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
        ? callbackUrl
        : "/chat";

    window.location.assign(destination);
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="muted">Use your Aether Chat account to continue.</p>
        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}
        <label className="field">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ marginTop: 16 }}>
          Need an account? <Link href="/register">Create one</Link>
        </p>
      </form>
    </div>
  );
}
