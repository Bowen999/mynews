import { Suspense } from "react";
import { AuthForm } from "./AuthForm";

export function AuthPage({ mode, statement, dek }: { mode: "login" | "signup" | "forgot" | "reset"; statement: string; dek: string }) {
  return (
    <div className="wrap">
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
            <AuthForm mode={mode} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
