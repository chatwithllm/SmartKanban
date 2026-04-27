import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';
import type { ApiToken, MirrorToken } from '../types.ts';
import { TemplatesTab } from './TemplatesTab.tsx';
import { useTheme } from '../hooks/useTheme.ts';

type Props = { onClose: () => void };

export function SettingsDialog({ onClose }: Props) {
  const { user, updateMe } = useAuth();
  const { mode, set: setTheme } = useTheme();
  const [shortName, setShortName] = useState(user?.short_name ?? '');
  const [shortErr, setShortErr] = useState<string | null>(null);
  const [shortOk, setShortOk] = useState(false);
  const saveShort = async () => {
    setShortErr(null);
    setShortOk(false);
    try {
      await updateMe({ short_name: shortName });
      setShortOk(true);
    } catch (e) {
      setShortErr(e instanceof Error ? e.message : 'failed');
    }
  };
  const [tokens, setTokens] = useState<MirrorToken[]>([]);
  const [identities, setIdentities] = useState<
    Array<{ telegram_user_id: number; app_user_id: string; telegram_username: string | null }>
  >([]);
  const [tgId, setTgId] = useState('');
  const [tgUser, setTgUser] = useState('');
  const [newLabel, setNewLabel] = useState('mirror');
  const [newToken, setNewToken] = useState<{ token: string; url: string } | null>(null);
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [apiLabel, setApiLabel] = useState('laptop');
  const [newApiToken, setNewApiToken] = useState<{ token: string; label: string } | null>(null);
  const [apiTokenError, setApiTokenError] = useState<string | null>(null);

  const refresh = async () => {
    setTokens(await api.mirrorTokens());
    setApiTokens(await api.apiTokens());
    setIdentities(await api.listTelegramIdentities());
  };

  useEffect(() => {
    refresh();
  }, []);

  const createToken = async () => {
    const r = await api.createMirrorToken(newLabel);
    setNewToken(r);
    await refresh();
  };
  const deleteToken = async (t: string) => {
    await api.deleteMirrorToken(t);
    await refresh();
  };
  const mintApiToken = async () => {
    setApiTokenError(null);
    try {
      const created = await api.createApiToken(apiLabel.trim() || 'api');
      setNewApiToken({ token: created.token, label: created.label });
      setApiLabel('laptop');
      setApiTokens(await api.apiTokens());
    } catch (e) {
      setApiTokenError(e instanceof Error ? e.message : String(e));
    }
  };
  const revokeApiToken = async (token: string) => {
    if (!confirm('Revoke this token? Devices and integrations using it will stop working.')) return;
    await api.deleteApiToken(token);
    setApiTokens(await api.apiTokens());
  };
  const linkTg = async () => {
    const id = Number(tgId);
    if (!id) return;
    await api.linkTelegram({ telegram_user_id: id, telegram_username: tgUser || undefined });
    setTgId('');
    setTgUser('');
    await refresh();
  };
  const unlinkTg = async (id: number) => {
    await api.unlinkTelegram(id);
    await refresh();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="modal-surface w-full max-w-[560px] max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header strip */}
        <div className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-3 font-semibold tracking-tight2 text-white">Settings</span>
          <button onClick={onClose} aria-label="Close" className="text-2 text-white/80 hover:text-white">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-6">
          {/* Theme toggle row */}
          <section className="flex items-center justify-between gap-4 py-3 border-b border-ink/10">
            <div>
              <div className="text-3 font-semibold text-ink tracking-tight2">Theme</div>
              <div className="text-1 text-ink-soft tracking-tight2">Light, dark, or follow your system</div>
            </div>
            <div className="flex rounded-pill bg-ceramic p-0.5">
              {(['light', 'dark', 'system'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTheme(m)}
                  className={`rounded-pill px-3 py-1 text-2 font-medium tracking-tight2 transition-colors ${
                    mode === m ? 'bg-card text-green-starbucks' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {m === 'light' ? 'Light' : m === 'dark' ? 'Dark' : 'System'}
                </button>
              ))}
            </div>
          </section>

          {/* Display name */}
          <section className="flex flex-col gap-3">
            <h3 className="text-3 font-semibold text-ink tracking-tight2">Your display name</h3>
            <p className="text-1 tracking-tight2 text-ink-soft">
              Shown on cards you create or are assigned to. 1–16 characters.
            </p>
            <div className="flex gap-2">
              <input
                value={shortName}
                onChange={(e) => setShortName(e.target.value.slice(0, 16))}
                placeholder="Short name"
                className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
              />
              <button onClick={saveShort} className="btn-pill btn-pill-filled-green">
                Save
              </button>
            </div>
            {shortErr && <div className="text-1 tracking-tight2 text-red">{shortErr}</div>}
            {shortOk && <div className="text-1 tracking-tight2 text-green-starbucks">Saved.</div>}
          </section>

          {/* Mirror tokens */}
          <section className="flex flex-col gap-3">
            <h3 className="text-3 font-semibold text-ink tracking-tight2">Mirror tokens</h3>
            <p className="text-1 tracking-tight2 text-ink-soft">
              Long-lived tokens for the wall-mounted mirror. Paste the URL into the kiosk browser.
            </p>
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (e.g. hallway mirror)"
                className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
              />
              <button onClick={createToken} className="btn-pill btn-pill-filled-green">
                Create
              </button>
            </div>
            {newToken && (
              <div className="rounded-card border border-green-accent/30 bg-green-light/20 p-3 text-1 tracking-tight2 text-ink break-all">
                <div className="font-semibold text-green-starbucks mb-1">New mirror URL:</div>
                <a href={newToken.url} className="underline text-green-starbucks">
                  {location.origin}
                  {newToken.url}
                </a>
              </div>
            )}
            <ul className="divide-y divide-ink/10 rounded-card border border-ink/10">
              {tokens.map((t) => (
                <li
                  key={t.token}
                  className="flex items-center justify-between px-3 py-2 text-2 tracking-tight2 text-ink"
                >
                  <span>
                    {t.label} · <span className="text-ink-soft">{t.token.slice(0, 8)}…</span>
                  </span>
                  <button
                    onClick={() => deleteToken(t.token)}
                    className="text-ink-soft hover:text-ink text-2 tracking-tight2"
                  >
                    Revoke
                  </button>
                </li>
              ))}
              {tokens.length === 0 && (
                <li className="px-3 py-2 text-1 tracking-tight2 text-ink-soft">No tokens yet.</li>
              )}
            </ul>
          </section>

          {/* API tokens */}
          <section className="flex flex-col gap-3">
            <h3 className="text-3 font-semibold text-ink tracking-tight2">API tokens</h3>
            <p className="text-1 tracking-tight2 text-ink-soft">
              Long-lived tokens for agent integrations like notetaker-kanban. Tokens have write access to your cards.
            </p>
            <div className="flex gap-2">
              <input
                value={apiLabel}
                onChange={(e) => setApiLabel(e.target.value)}
                placeholder="Label (e.g. laptop, desktop)"
                className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
              />
              <button onClick={mintApiToken} className="btn-pill btn-pill-filled-green">
                Generate
              </button>
            </div>
            {newApiToken && (
              <div className="rounded-card border border-green-accent/30 bg-green-light/20 p-3 text-1 tracking-tight2 text-ink break-all">
                <div className="font-semibold text-green-starbucks mb-1">
                  Token created — copy now, it won't be shown again:
                </div>
                <code className="block bg-card rounded-card p-2 mt-1 font-mono">{newApiToken.token}</code>
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    className="btn-pill btn-pill-filled-green"
                    onClick={() => navigator.clipboard.writeText(newApiToken.token)}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn-pill btn-pill-outlined-dark"
                    onClick={() => setNewApiToken(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-ink/10 rounded-card border border-ink/10">
              {apiTokens.map((t) => (
                <li
                  key={t.token}
                  className="flex items-center justify-between px-3 py-2 text-2 tracking-tight2 text-ink"
                >
                  <span>
                    {t.label} · <span className="text-ink-soft">…{t.token.slice(-8)}</span>
                    <span className="ml-2 text-1 text-ink-soft">{new Date(t.created_at).toLocaleString()}</span>
                  </span>
                  <button
                    onClick={() => revokeApiToken(t.token)}
                    className="text-ink-soft hover:text-ink text-2 tracking-tight2"
                  >
                    Revoke
                  </button>
                </li>
              ))}
              {apiTokens.length === 0 && (
                <li className="px-3 py-2 text-1 tracking-tight2 text-ink-soft">No tokens yet.</li>
              )}
            </ul>
            {apiTokenError && (
              <div className="text-1 tracking-tight2 text-red">{apiTokenError}</div>
            )}
          </section>

          {/* Telegram identities */}
          <section className="flex flex-col gap-3">
            <h3 className="text-3 font-semibold text-ink tracking-tight2">Telegram identities</h3>
            <p className="text-1 tracking-tight2 text-ink-soft">
              Link Telegram user IDs to family members so the bot knows who's captured what. Get your
              ID from <code>@userinfobot</code>.
            </p>
            <div className="flex gap-2">
              <input
                value={tgId}
                onChange={(e) => setTgId(e.target.value)}
                placeholder="Telegram user ID"
                className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
              />
              <input
                value={tgUser}
                onChange={(e) => setTgUser(e.target.value)}
                placeholder="@username (optional)"
                className="flex-1 bg-card border border-ink/10 rounded-card px-3 py-2 text-3 text-ink tracking-tight2 placeholder:text-ink-soft focus:border-green-accent focus:outline-none"
              />
              <button onClick={linkTg} className="btn-pill btn-pill-filled-green">
                Link to me
              </button>
            </div>
            <ul className="divide-y divide-ink/10 rounded-card border border-ink/10">
              {identities.map((i) => (
                <li
                  key={i.telegram_user_id}
                  className="flex items-center justify-between px-3 py-2 text-2 tracking-tight2 text-ink"
                >
                  <span>
                    {i.telegram_user_id}
                    {i.telegram_username ? ` (@${i.telegram_username})` : ''} →{' '}
                    <span className="text-ink-soft">{i.app_user_id.slice(0, 8)}…</span>
                  </span>
                  <button
                    onClick={() => unlinkTg(i.telegram_user_id)}
                    className="text-ink-soft hover:text-ink text-2 tracking-tight2"
                  >
                    Unlink
                  </button>
                </li>
              ))}
              {identities.length === 0 && (
                <li className="px-3 py-2 text-1 tracking-tight2 text-ink-soft">No links yet.</li>
              )}
            </ul>
          </section>

          {/* Templates */}
          <section>
            <TemplatesTab me={user!} />
          </section>
        </div>
      </div>
    </div>
  );
}
