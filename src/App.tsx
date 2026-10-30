import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import "./App.css";
import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_MARLOW_API_URL ?? "http://127.0.0.1:8000";
const ACCOUNTS_STORAGE_KEY = "marlow.accounts";
const ACTIVE_ACCOUNT_STORAGE_KEY = "marlow.activeAccount";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AccountProfile {
  id: string;
  name: string;
  householdId: string;
}

interface ApiMessage {
  detail?: string | { msg?: string }[];
  plan?: string;
  summary?: string;
  answer?: string;
  response?: string;
  email?: string;
  user_id?: string;
}

function loadAccounts(): AccountProfile[] {
  try {
    const saved = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is AccountProfile =>
        typeof item?.id === "string" &&
        typeof item?.name === "string" &&
        typeof item?.householdId === "string",
    );
  } catch {
    return [];
  }
}

function getErrorMessage(detail: ApiMessage["detail"]): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join(" ");
  return undefined;
}

function hasPasswordSetupLink(): boolean {
  if (typeof window === "undefined") return false;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  return Boolean(fragment.get("access_token")) && ["invite", "recovery"].includes(fragment.get("type") ?? "");
}

function getAuthLinkError(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const code = fragment.get("error_code");
  const description = fragment.get("error_description")?.replaceAll("+", " ");
  if (!code && !description && !fragment.has("error")) return undefined;
  if (code === "otp_expired") return "This email link has expired or was already used. Request a fresh link and open it promptly.";
  return description || "This email link is invalid or expired. Request a new link.";
}

function clearAuthFragment() {
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [passwordSetup, setPasswordSetup] = useState(hasPasswordSetupLink);
  const [authReady, setAuthReady] = useState(false);
  const [accounts, setAccounts] = useState<AccountProfile[]>(loadAccounts);
  const [activeAccountId, setActiveAccountId] = useState(
    () => localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY) ?? "",
  );
  const [accountName, setAccountName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [response, setResponse] = useState(() => getAuthLinkError() ?? "");
  const [responseType, setResponseType] = useState<"success" | "error">(() => getAuthLinkError() ? "error" : "success");
  const [busy, setBusy] = useState<"auth" | "remember" | "plan" | "summary" | null>(null);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAuthReady(true);
      return;
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    async function initializeAuth(authClient: NonNullable<typeof supabase>) {
      const linkError = getAuthLinkError();
      if (linkError) {
        setResponse(linkError);
        setResponseType("error");
        setPasswordSetup(false);
        clearAuthFragment();
        setAuthReady(true);
        return;
      }

      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      if (hasPasswordSetupLink() && accessToken && refreshToken) {
        try {
          const { data, error } = await authClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          setSession(data.session);
          setPasswordSetup(true);
          clearAuthFragment();
        } catch (error) {
          setPasswordSetup(false);
          setResponseType("error");
          setResponse(error instanceof Error
            ? `Could not establish a session from this email link: ${error.message}`
            : "Could not establish a session from this email link. Request a fresh link.");
          clearAuthFragment();
        } finally {
          setAuthReady(true);
        }
        return;
      }

      if (hasPasswordSetupLink()) {
        setPasswordSetup(false);
        setResponseType("error");
        setResponse("This email link is incomplete. Request a fresh link and open it in the same browser as Marlow.");
        clearAuthFragment();
      }

      const { data, error } = await authClient.auth.getSession();
      setSession(data.session);
      if (error) {
        setResponseType("error");
        setResponse(error.message);
      }
      setAuthReady(true);
    }

    void initializeAuth(client);
    return () => subscription.unsubscribe();
  }, []);

  function saveAccounts(nextAccounts: AccountProfile[], nextActiveId = activeAccountId) {
    setAccounts(nextAccounts);
    setActiveAccountId(nextActiveId);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts));
    localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, nextActiveId);
  }

  function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanHouseholdId = householdId.trim();

    if (!UUID_PATTERN.test(cleanHouseholdId)) {
      setResponseType("error");
      setResponse("Enter a valid UUID for the household ID.");
      return;
    }

    const profile: AccountProfile = {
      id: crypto.randomUUID(),
      name: accountName.trim() || `Account ${accounts.length + 1}`,
      householdId: cleanHouseholdId,
    };
    saveAccounts([...accounts, profile], profile.id);
    setAccountName("");
    setHouseholdId("");
    setResponse("");
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setBusy("auth");
    setResponse("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(null);
    }
  }

  async function sendPasswordReset() {
    if (!supabase || !email.trim()) {
      setResponseType("error");
      setResponse("Enter your email address first.");
      return;
    }

    setBusy("auth");
    setResponse("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResponseType("success");
      setResponse("If an account exists for that email, a password reset link is on its way.");
    } catch (error) {
      setResponseType("error");
      const message = error instanceof Error ? error.message : "";
      setResponse(message.toLowerCase().includes("rate limit")
        ? "Supabase temporarily rate-limited password recovery emails. Wait before requesting another link. If this keeps happening, check the Supabase Auth logs and configure a custom SMTP provider."
        : message || "Unable to send a password reset email.");
    } finally {
      setBusy(null);
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!session) {
      setResponseType("error");
      setResponse("The email link has not established a valid session yet. Request a new link and open it in this browser.");
      return;
    }
    if (password !== confirmPassword) {
      setResponseType("error");
      setResponse("The passwords do not match.");
      return;
    }

    setBusy("auth");
    setResponse("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirmPassword("");
      setPasswordSetup(false);
      clearAuthFragment();
      setResponseType("success");
      setResponse("Your password is set. You are now signed in.");
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to set your password.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy("auth");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setBusy(null);
    }
  }

  async function inviteHouseholdOwner() {
    setBusy("auth");
    setResponse("");
    try {
      const data = await requestMarlow("/households/invite-owner", { method: "POST" });
      setResponseType("success");
      setResponse(`An invitation was sent to ${data.email ?? "the household owner"}. They can use the secure email link to set a password.`);
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to send the household owner invitation.");
    } finally {
      setBusy(null);
    }
  }

  function removeActiveAccount() {
    if (!activeAccount) return;
    const nextAccounts = accounts.filter((account) => account.id !== activeAccount.id);
    saveAccounts(nextAccounts, nextAccounts[0]?.id ?? "");
  }

  async function requestMarlow(path: string, init?: RequestInit): Promise<ApiMessage> {
    if (!session) throw new Error("Sign in to your Marlow account first.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${session.access_token}`);
    const result = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
    const data: ApiMessage = await result.json();
    if (!result.ok) {
      throw new Error(getErrorMessage(data.detail) || `Marlow returned an error (${result.status}).`);
    }
    return data;
  }

  async function remember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAccount || !memoryText.trim()) return;

    setBusy("remember");
    setResponse("");
    try {
      await requestMarlow("/remember", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: memoryText.trim(),
          household_id: activeAccount.householdId,
        }),
      });
      setResponseType("success");
      setResponse("Saved to this household's memories.");
      setMemoryText("");
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to save this memory.");
    } finally {
      setBusy(null);
    }
  }

  async function requestPlan() {
    if (!activeAccount) return;

    setBusy("plan");
    setResponse("");
    const params = new URLSearchParams({ household_id: activeAccount.householdId });
    try {
      const data = await requestMarlow(`/plan?${params.toString()}`);
      setResponseType("success");
      setResponse(data.plan || data.summary || data.response || "Marlow did not return a checklist.");
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to get a checklist.");
    } finally {
      setBusy(null);
    }
  }

  async function requestSummary() {
    if (!activeAccount) return;

    setBusy("summary");
    setResponse("");
    const params = new URLSearchParams({ household_id: activeAccount.householdId });
    try {
      const data = await requestMarlow(`/ask?${params.toString()}`);
      setResponseType("success");
      setResponse(data.summary || data.answer || data.response || "Marlow did not return a summary.");
    } catch (error) {
      setResponseType("error");
      setResponse(error instanceof Error ? error.message : "Unable to get a summary.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Marlow home">
          <span className="brand-mark" aria-hidden="true">m</span>
          <span>Marlow</span>
        </a>
        <div className="connection"><span className="connection-dot" /> Your household memory space</div>
      </header>

      <div className="page-content" id="top">
        <section className="intro">
          <p className="eyebrow">A little more in sync</p>
          <h1>Keep the details<br />that make a home.</h1>
          <p className="intro-copy">A shared memory for the things your household wants to remember—and find again.</p>
        </section>

        <section className="account-panel auth-panel" aria-labelledby="auth-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Secure access</p>
              <h2 id="auth-heading">{passwordSetup ? "Set your password" : session ? "Your Marlow login" : "Sign in to Marlow"}</h2>
            </div>
            {session && !passwordSetup && <button className="text-button" type="button" onClick={signOut} disabled={busy !== null}>Sign out</button>}
          </div>
          {passwordSetup ? (
            <form className="account-form" onSubmit={saveNewPassword}>
              <label className="field-label" htmlFor="new-password">New password</label>
              <input id="new-password" name="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              <label className="field-label" htmlFor="confirm-password">Confirm password</label>
              <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              {!authReady && <p className="form-note">Verifying your secure email link…</p>}
              <button className="secondary-button" type="submit" disabled={!supabase || !authReady || !session || busy !== null}>
                {busy === "auth" ? "Saving password…" : "Set password"}
              </button>
            </form>
          ) : session ? (
            <>
              <p className="auth-status">Signed in as <strong>{session.user.email}</strong>. Your identity is verified by Supabase.</p>
              <div className="invite-owner">
                <p className="form-note">Send the configured household owner a secure Supabase invitation. The invitation address is managed by Marlow.</p>
                <button className="secondary-button" type="button" onClick={inviteHouseholdOwner} disabled={busy !== null}>
                  {busy === "auth" ? "Sending invitation…" : "Invite household owner"}
                </button>
              </div>
            </>
          ) : (
            <form className="account-form" onSubmit={signIn}>
              <label className="field-label" htmlFor="sign-in-email">Email</label>
              <input id="sign-in-email" name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label className="field-label" htmlFor="sign-in-password">Password</label>
              <input id="sign-in-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
              {!supabase && <p className="form-note">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.</p>}
              <button className="secondary-button" type="submit" disabled={!supabase || busy !== null}>
                {busy === "auth" ? "Signing in…" : "Sign in"}
              </button>
              <button className="text-button password-reset-button" type="button" onClick={sendPasswordReset} disabled={!supabase || busy !== null}>
                Forgot password?
              </button>
              <p className="form-note">New accounts are invited through Marlow by an authenticated user; direct public sign-up is disabled.</p>
            </form>
          )}
        </section>

        <section className="account-panel" aria-labelledby="account-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Your space</p>
              <h2 id="account-heading">Household account</h2>
            </div>
            {activeAccount && <span className="account-count">{accounts.length} {accounts.length === 1 ? "account" : "accounts"}</span>}
          </div>

          {accounts.length > 0 && (
            <div className="account-switcher">
              <label className="field-label" htmlFor="account-select">Use an account</label>
              <div className="switcher-row">
                <select
                  id="account-select"
                  value={activeAccountId}
                  onChange={(event) => {
                    setActiveAccountId(event.target.value);
                    localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, event.target.value);
                    setResponse("");
                  }}
                >
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
                <button className="text-button" type="button" onClick={removeActiveAccount}>Remove</button>
              </div>
              {activeAccount && <p className="account-hint">Household <span>{activeAccount.householdId}</span></p>}
            </div>
          )}

          <details className="add-account" open={accounts.length === 0}>
            <summary>{accounts.length ? "Add another account" : "Set up your account"}</summary>
            <form className="account-form" onSubmit={addAccount}>
              <label className="field-label" htmlFor="account-name">Account name <span>Optional</span></label>
              <input id="account-name" name="account-name" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="e.g. Home, Cabin, Jordan" />
              <label className="field-label" htmlFor="household-id">Household ID</label>
              <input id="household-id" name="household-id" required value={householdId} onChange={(event) => setHouseholdId(event.target.value)} placeholder="UUID provided for your household" autoComplete="off" />
              <p className="form-note">Your account identity comes from your secure sign-in. Profiles are saved only in this browser; household access must be provisioned by an administrator.</p>
              <button className="secondary-button" type="submit">Save account</button>
            </form>
          </details>
        </section>

        <section className="workspace" aria-label="Marlow memory tools">
          <form className="tool-card remember-card" onSubmit={remember}>
            <div className="tool-icon remember-icon" aria-hidden="true">✳</div>
            <p className="eyebrow">Add to your memories</p>
            <h2>Tell Marlow</h2>
            <p className="tool-copy">Share a detail your household might want to remember later.</p>
            <textarea
              id="memory-text"
              name="memory-text"
              aria-label="Something you want Marlow to remember"
              placeholder="The spare key is in the blue drawer…"
              value={memoryText}
              onChange={(event) => setMemoryText(event.target.value)}
              rows={4}
            />
            <button className="primary-button" type="submit" disabled={!session || !activeAccount || !memoryText.trim() || busy !== null}>
              {busy === "remember" ? "Saving…" : "Save a memory"}<span aria-hidden="true">↗</span>
            </button>
          </form>

          <section className="tool-card ask-card">
            <div className="tool-icon ask-icon" aria-hidden="true">⌕</div>
            <p className="eyebrow">Your next steps</p>
            <h2>Short checklist</h2>
            <p className="tool-copy">Get a concise checklist based on this household’s saved memories.</p>
            <button className="primary-button" type="button" onClick={requestPlan} disabled={!session || !activeAccount || busy !== null}>
              {busy === "plan" ? "Preparing checklist…" : "Request checklist"}<span aria-hidden="true">↗</span>
            </button>
          </section>

          <section className="tool-card ask-marlow-card">
            <div className="tool-icon ask-marlow-icon" aria-hidden="true">?</div>
            <p className="eyebrow">Your household at a glance</p>
            <h2>Overall summary</h2>
            <p className="tool-copy">Get an overall summary of the memories saved for this household.</p>
            <button className="primary-button" type="button" onClick={requestSummary} disabled={!session || !activeAccount || busy !== null}>
              {busy === "summary" ? "Summarizing…" : "Request summary"}<span aria-hidden="true">↗</span>
            </button>
          </section>
        </section>

        {(!session || !activeAccount) && <p className="setup-note">{!session ? "Sign in and add a household above to use Marlow's memory tools." : "Add a household above to start saving and summarizing memories."}</p>}

        {response && (
          <section className={`response-card ${responseType}`} aria-live="polite">
            <span className="response-label">{responseType === "error" ? "Something went wrong" : "Marlow says"}</span>
            <p>{response}</p>
          </section>
        )}

        <footer className="footer">A calmer way to remember, together.</footer>
      </div>
    </main>
  );
}

export default App;