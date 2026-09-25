import { SessionProvider, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";
import "../styles/globals.css";

function Shell({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            Ae
          </span>
          Aether Chat
        </Link>
        <nav className="nav-links" aria-label="Primary">
          <Link href="/" aria-current={router.pathname === "/" ? "page" : undefined}>
            Home
          </Link>
          <Link href="/chat" aria-current={router.pathname.startsWith("/chat") ? "page" : undefined}>
            Chat
          </Link>
          <Link href="/documents" aria-current={router.pathname === "/documents" ? "page" : undefined}>
            Documents
          </Link>
          {status === "authenticated" ? (
            <>
              <span className="muted">{session.user?.email}</span>
              <button type="button" onClick={() => signOut({ callbackUrl: "/" })}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/register">Create account</Link>
            </>
          )}
        </nav>
      </header>
      <main id="main">{children}</main>
    </>
  );
}

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Shell>
        <Component {...pageProps} />
      </Shell>
    </SessionProvider>
  );
}
