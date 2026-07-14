import { useState } from "react";
import { Logo } from "../lib/icons";

interface LoginGateProps {
  error: boolean;
  onSubmit: (password: string) => void;
}

export function LoginGate({ error, onSubmit }: LoginGateProps) {
  const [password, setPassword] = useState("");
  return (
    <div className="login-gate">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.trim()) onSubmit(password.trim());
        }}
      >
        <Logo className="login-logo" />
        <h2>Phone Monitor</h2>
        <p>Enter the access password to continue.</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          autoFocus
        />
        {error && <div className="login-error">Incorrect password — try again.</div>}
        <button type="submit">Unlock</button>
      </form>
    </div>
  );
}
