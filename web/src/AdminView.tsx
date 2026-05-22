import { useState } from 'react';
import { UsersTab } from './components/admin/UsersTab.tsx';
import { ApprovalsTab } from './components/admin/ApprovalsTab.tsx';
import { AuditTab } from './components/admin/AuditTab.tsx';

type Tab = 'users' | 'approvals' | 'audit';

export function AdminView() {
  const [tab, setTab] = useState<Tab>('users');

  const tabBtn = (t: Tab, _label: string): React.CSSProperties => ({
    padding: '10px 14px',
    background: 'transparent',
    color: tab === t ? 'rgb(var(--ink))' : 'rgb(var(--ink-soft))',
    border: 'none',
    borderBottom: tab === t ? '2px solid rgb(var(--violet))' : '2px solid transparent',
    cursor: 'pointer', fontSize: 14, fontWeight: 600,
  });

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Admin</h1>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgb(var(--hairline) / 0.10)', marginBottom: 20 }}>
        <button style={tabBtn('users', 'Users')} onClick={() => setTab('users')}>Users</button>
        <button style={tabBtn('approvals', 'Approvals')} onClick={() => setTab('approvals')}>Approvals</button>
        <button style={tabBtn('audit', 'Audit')} onClick={() => setTab('audit')}>Audit</button>
      </div>
      {tab === 'users' && <UsersTab />}
      {tab === 'approvals' && <ApprovalsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
