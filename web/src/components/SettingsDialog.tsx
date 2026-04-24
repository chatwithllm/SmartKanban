import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';
import type { MirrorToken } from '../types.ts';

type Props = { onClose: () => void };

export function SettingsDialog({ onClose }: Props) {
  const { user, updateMe } = useAuth();
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

  const refresh = async () => {
    setTokens(await api.mirrorTokens());
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100">
            ✕
          </button>
        </div>

        <section className="space-y-3 mb-6">
          <h3 className="text-sm font-medium text-neutral-300">Your display name</h3>
          <p className="text-xs text-neutral-500">
            Shown on cards you create or are assigned to. 1–16 characters.
          </p>
          <div className="flex gap-2">
            <input
              value={shortName}
              onChange={(e) => setShortName(e.target.value.slice(0, 16))}
              placeholder="Short name"
              className="flex-1 rounded-lg bg-neutral-950 px-2 py-1.5 text-sm border border-neutral-800 focus:border-neutral-700 outline-none"
            />
            <button
              onClick={saveShort}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm text-neutral-900 hover:bg-white"
            >
              Save
            </button>
          </div>
          {shortErr && <div className="text-xs text-red-300">{shortErr}</div>}
          {shortOk && <div className="text-xs text-emerald-300">Saved.</div>}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">Mirror tokens</h3>
          <p className="text-xs text-neutral-500">
            Long-lived tokens for the wall-mounted mirror. Paste the URL into the kiosk browser.
          </p>
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. hallway mirror)"
              className="flex-1 rounded-lg bg-neutral-950 px-2 py-1.5 text-sm border border-neutral-800 focus:border-neutral-700 outline-none"
            />
            <button
              onClick={createToken}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm text-neutral-900 hover:bg-white"
            >
              Create
            </button>
          </div>
          {newToken && (
            <div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-2 text-xs text-emerald-100 break-all">
              <div>New mirror URL:</div>
              <a href={newToken.url} className="underline">
                {location.origin}
                {newToken.url}
              </a>
            </div>
          )}
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {tokens.map((t) => (
              <li
                key={t.token}
                className="flex items-center justify-between px-3 py-2 text-xs text-neutral-300"
              >
                <span>
                  {t.label} · <span className="text-neutral-500">{t.token.slice(0, 8)}…</span>
                </span>
                <button
                  onClick={() => deleteToken(t.token)}
                  className="text-neutral-500 hover:text-neutral-200"
                >
                  Revoke
                </button>
              </li>
            ))}
            {tokens.length === 0 && (
              <li className="px-3 py-2 text-xs text-neutral-600">No tokens yet.</li>
            )}
          </ul>
        </section>

        <section className="mt-6 space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">Telegram identities</h3>
          <p className="text-xs text-neutral-500">
            Link Telegram user IDs to family members so the bot knows who's captured what. Get your
            ID from <code>@userinfobot</code>.
          </p>
          <div className="flex gap-2">
            <input
              value={tgId}
              onChange={(e) => setTgId(e.target.value)}
              placeholder="Telegram user ID"
              className="flex-1 rounded-lg bg-neutral-950 px-2 py-1.5 text-sm border border-neutral-800 focus:border-neutral-700 outline-none"
            />
            <input
              value={tgUser}
              onChange={(e) => setTgUser(e.target.value)}
              placeholder="@username (optional)"
              className="flex-1 rounded-lg bg-neutral-950 px-2 py-1.5 text-sm border border-neutral-800 focus:border-neutral-700 outline-none"
            />
            <button
              onClick={linkTg}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm text-neutral-900 hover:bg-white"
            >
              Link to me
            </button>
          </div>
          <ul className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
            {identities.map((i) => (
              <li
                key={i.telegram_user_id}
                className="flex items-center justify-between px-3 py-2 text-xs text-neutral-300"
              >
                <span>
                  {i.telegram_user_id}
                  {i.telegram_username ? ` (@${i.telegram_username})` : ''} →{' '}
                  <span className="text-neutral-500">{i.app_user_id.slice(0, 8)}…</span>
                </span>
                <button
                  onClick={() => unlinkTg(i.telegram_user_id)}
                  className="text-neutral-500 hover:text-neutral-200"
                >
                  Unlink
                </button>
              </li>
            ))}
            {identities.length === 0 && (
              <li className="px-3 py-2 text-xs text-neutral-600">No links yet.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
