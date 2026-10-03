import { Suspense } from "react";
import type { OAuthProvider } from "@/lib/auth/providers";
import { AuthForm } from "./AuthForm";
import { Page } from "./PageTransition";

export function AuthPage({
  mode,
  statement,
  dek,
  providers,
}: {
  mode: "login" | "signup" | "forgot" | "reset";
  statement: string;
  dek: string;
  providers?: OAuthProvider[];
}) {
  return (
    <Page>
      <div className="split">
        <div className="statement">
          <div className="label">MyNews</div>
          <h1 className="display" style={{ marginTop: 24, maxWidth: "11ch" }}>
            {statement}
          </h1>
          <p className="dek" style={{ marginTop: 26, maxWidth: "34ch" }}>
            {dek}
          </p>
        </div>
        <div className="panel">
          <Suspense>
            <AuthForm mode={mode} providers={providers} />
          </Suspense>
        </div>
      </div>
    </Page>
  );
}
