import Link from "next/link";
import { GenerateButton } from "./GenerateButton";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="wordmark" aria-label="MyNews home">
          MyNews<i>.</i>
        </Link>
        <NavLinks />
        <div className="header-actions">
          <ThemeToggle />
          <GenerateButton />
        </div>
      </div>
    </header>
  );
}
