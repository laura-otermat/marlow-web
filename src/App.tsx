import { useState, type FormEvent } from "react";
import "./App.css";

const API_BASE_URL = import.meta.env.VITE_MARLOW_API_URL ?? "http://127.0.0.1:8000";
const ACCOUNTS_STORAGE_KEY = "marlow.accounts";
const ACTIVE_ACCOUNT_STORAGE_KEY = "marlow.activeAccount";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AccountProfile {
  id: string;
  name: string;
  householdId: string;
  userId: string;
}

interface ApiMessage {
  detail?: string | { msg?: string }[];
  summary?: string;
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
        typeof item?.householdId === "string" &&
        typeof item?.userId === "string",
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

function App() {
  const [accounts, setAccounts] = useState<AccountProfile[]>(loadAccounts);
  const [activeAccountId, setActiveAccountId] = useState(
    () => localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY) ?? "",
  );
  const [accountName, setAccountName] = useState("");
  const [householdId, setHouseholdId] = useState("");
  const [userId, setUserId] = useState("");
  const [memoryText, setMemoryText] = useState("");
  const [response, setResponse] = useState("");
  const [responseType, setResponseType] = useState<"success" | "error">("success");
  const [busy, setBusy] = useState<"remember" | "ask" | null>(null);

  const activeAccount = accounts.find((account) => account.id === activeAccountId);

  function saveAccounts(nextAccounts: AccountProfile[], nextActiveId = activeAccountId) {
    setAccounts(nextAccounts);
    setActiveAccountId(nextActiveId);
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(nextAccounts));
    localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, nextActiveId);
  }

  function addAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanHouseholdId = householdId.trim();
    const cleanUserId = userId.trim();

    if (!UUID_PATTERN.test(cleanHouseholdId) || !UUID_PATTERN.test(cleanUserId)) {
      setResponseType("error");
      setResponse("Enter valid UUIDs for both the household and user IDs.");
      return;
    }

    const profile: AccountProfile = {
      id: crypto.randomUUID(),
      name: accountName.trim() || `Account ${accounts.length + 1}`,
      householdId: cleanHouseholdId,
      userId: cleanUserId,
    };
    saveAccounts([...accounts, profile], profile.id);
    setAccountName("");
    setHouseholdId("");
    setUserId("");
    setResponse("");
  }

  function removeActiveAccount() {
    if (!activeAccount) return;
    const nextAccounts = accounts.filter((account) => account.id !== activeAccount.id);
    saveAccounts(nextAccounts, nextAccounts[0]?.id ?? "");
  }

  async function requestMarlow(path: string, init?: RequestInit): Promise<ApiMessage> {
    const result = await fetch(`${API_BASE_URL}${path}`, init);
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
          created_by_user_id: activeAccount.userId,
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

  async function ask() {
    if (!activeAccount) return;

    setBusy("ask");
    setResponse("");
    const params = new URLSearchParams({ household_id: activeAccount.householdId });
    try {
      const data = await requestMarlow(`/ask?${params.toString()}`);
      setResponseType("success");
      setResponse(data.summary || "Marlow did not return a summary.");
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
              <input id="account-name" value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="e.g. Home, Cabin, Jordan" />
              <label className="field-label" htmlFor="household-id">Household ID</label>
              <input id="household-id" required value={householdId} onChange={(event) => setHouseholdId(event.target.value)} placeholder="UUID provided for your household" autoComplete="off" />
              <label className="field-label" htmlFor="user-id">Your user ID</label>
              <input id="user-id" required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="UUID for your user account" autoComplete="off" />
              <p className="form-note">Use the IDs supplied for your Marlow account. Profiles are saved only in this browser.</p>
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
              aria-label="Something you want Marlow to remember"
              placeholder="The spare key is in the blue drawer…"
              value={memoryText}
              onChange={(event) => setMemoryText(event.target.value)}
              rows={4}
            />
            <button className="primary-button" type="submit" disabled={!activeAccount || !memoryText.trim() || busy !== null}>
              {busy === "remember" ? "Saving…" : "Save a memory"}<span aria-hidden="true">↗</span>
            </button>
          </form>

          <section className="tool-card ask-card">
            <div className="tool-icon ask-icon" aria-hidden="true">⌕</div>
            <p className="eyebrow">Your household at a glance</p>
            <h2>Memory summary</h2>
            <p className="tool-copy">Get a concise summary of the memories saved for this household.</p>
            <button className="primary-button" type="button" onClick={ask} disabled={!activeAccount || busy !== null}>
              {busy === "ask" ? "Summarizing…" : "Summarize memories"}<span aria-hidden="true">↗</span>
            </button>
          </section>
        </section>

        {!activeAccount && <p className="setup-note">Add an account above to start saving and searching household memories.</p>}

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