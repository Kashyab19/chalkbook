'use client';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { selectDeviceOwner } from '@/lib/device-account';
export function SignIn({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form
      className="sign-in-card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setMessage('');
        setBusy(true);
        try {
          const response = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          if (!response.ok)
            throw Error(
              response.status === 429
                ? 'Please wait a minute before trying again.'
                : 'Check your account name and password, then try again.',
            );
          const result = (await response.json()) as { user?: { id?: string } };
          if (result.user?.id) {
            selectDeviceOwner(result.user.id);
            location.reload();
            return;
          }
          setPassword('');
          setMessage('Signed in.');
          await onSuccess();
        } catch (error) {
          setMessage((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="sign-in-heading">
        <span className="auth-lock">
          <LockKeyhole size={20} aria-hidden="true" />
        </span>
        <p className="eyebrow">YOUR PRIVATE SPACE</p>
        <h1>Welcome back.</h1>
        <p className="muted">Pick up where you left off.</p>
      </div>
      <label>
        Account name
        <input
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          placeholder="Your account name"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </label>
      <label>
        Password
        <span className="password-field">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Your password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="password-toggle"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff size={20} aria-hidden="true" />
            ) : (
              <Eye size={20} aria-hidden="true" />
            )}
          </button>
        </span>
      </label>
      <button className="primary sign-in-submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
        {!busy && <ArrowRight size={18} aria-hidden="true" />}
      </button>
      <output className="sign-in-message" aria-live="polite">
        {message}
      </output>
      <p className="sign-in-privacy">Just you and your progress.</p>
    </form>
  );
}
