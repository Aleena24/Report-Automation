import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, qk } from '../api';
import type { Me } from '../types';
import { Button, ErrorBox, Loader } from './ui';

const I = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  mail: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  doc: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h8"/></svg>,
  users: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></svg>,
  help: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>,
  list: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>,
  bell: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>,
};

interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

export default function Layout() {
  const me = useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/me'), staleTime: 60_000 });
  const [install, setInstall] = useState<BeforeInstallPromptEvent | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as BeforeInstallPromptEvent); };
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const nav = (cls: string) => (
    <>
      <NavLink to="/" end className={cls}>{I.home}<span>Today</span></NavLink>
      <NavLink to="/data" className={cls}>{I.grid}<span>Data</span></NavLink>
      <NavLink to="/mail-log" className={cls}>{I.mail}<span>Mail log</span></NavLink>
      <NavLink to="/settings" className={cls}>{I.gear}<span>Settings</span></NavLink>
    </>
  );

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand"><img src="/icons/icon.svg" alt="" />Daily Reports</Link>
        {me.data?.dryRun && <span className="badge amber">DRY RUN</span>}
        {!online && <span className="badge red">offline</span>}
        <div className="spacer" />
        {install && <Button size="sm" onClick={async () => { await install.prompt(); setInstall(null); }} style={{ color: '#fff', background: 'rgba(255,255,255,.14)', borderColor: 'rgba(255,255,255,.3)' }}>Install app</Button>}
        {me.data && <div className="who">{me.data.email}<small>{me.data.role}</small></div>}
      </header>
      <nav className="sidenav">
        {nav('')}
        <div className="group">Data</div>
        <NavLink to="/course-plans">{I.doc}<span>Course plans</span></NavLink>
        <NavLink to="/student-profiles">{I.users}<span>Student profiles</span></NavLink>
        <NavLink to="/queries">{I.help}<span>Queries</span></NavLink>
        <NavLink to="/tracker">{I.list}<span>Dev tracker</span></NavLink>
        <NavLink to="/faculty">{I.bell}<span>Faculty</span></NavLink>
      </nav>
      <main className="main">
        {me.isLoading ? <Loader /> : me.error ? <ErrorBox error={me.error} /> : <Outlet />}
      </main>
      <nav className="bottomnav">{nav('')}</nav>
    </div>
  );
}
