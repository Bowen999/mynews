import Link from "next/link";
import { currentUser } from "@/lib/session";
import { AccountMenu } from "./AccountMenu";
import { GenerateButton } from "./GenerateButton";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export async function SiteHeader() {
  const user = await currentUser();
  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="wordmark" aria-label="MyNews home">
          MyNews
        </Link>
        {user ? <NavLinks /> : <span style={{ marginRight: "auto" }} />}
        <div className="header-actions">
          <ThemeToggle />
          {user ? (
            <>
              <GenerateButton />
              <AccountMenu email={user.email} isAdmin={user.isAdmin} />
            </>
          ) : (
            <>
              <Link className="btn btn-quiet btn-sm" href="/login">
                Sign in
              </Link>
              <Link className="btn btn-solid btn-sm" href="/signup">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>MyNews — a personal weekly intelligence briefing.</span>
        <span>Every statement links to its source.</span>
      </div>
    </footer>
  );
}
