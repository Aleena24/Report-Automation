import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';

export function Button({ variant = '', size = '', busy, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: '' | 'primary' | 'danger' | 'ghost'; size?: '' | 'sm'; busy?: boolean }) {
  return (
    <button className={`btn ${variant} ${size} ${className}`} disabled={busy || rest.disabled} {...rest}>
      {busy && <span className="spin" />}{children}
    </button>
  );
}

export function LinkButton({ to, variant = '', size = '', children }: { to: string; variant?: '' | 'primary' | 'ghost'; size?: '' | 'sm'; children: ReactNode }) {
  return <Link className={`btn ${variant} ${size}`} to={to}>{children}</Link>;
}

export type Tone = 'grey' | 'green' | 'red' | 'amber' | 'navy';
export function Badge({ tone = 'grey', children, outline }: { tone?: Tone; children: ReactNode; outline?: boolean }) {
  return <span className={`badge ${tone === 'grey' ? '' : tone} ${outline ? 'outline' : ''}`}>{children}</span>;
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export function Card({ children, className = '', title }: { children: ReactNode; className?: string; title?: ReactNode }) {
  return <section className={`card ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}

export function Stat({ to, value, label, bad, good }: { to?: string; value: number | string; label: string; bad?: boolean; good?: boolean }) {
  const inner = <><div className={`v ${bad ? 'bad' : good ? 'good' : ''}`}>{value}</div><div className="l">{label}</div></>;
  return to ? <Link className="stat" to={to}>{inner}</Link> : <div className="stat">{inner}</div>;
}

export function Loader() { return <div className="center"><div className="loader" /></div>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

export function Banner({ tone, children }: { tone: 'amber' | 'red' | 'navy' | 'green'; children: ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

export function Field({ label, help, children, full }: { label: string; help?: ReactNode; children: ReactNode; full?: boolean }) {
  return <div className={`field ${full ? 'full' : ''}`}><label>{label}</label>{children}{help && <div className="help">{help}</div>}</div>;
}

export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dlg ${wide ? 'wide' : ''}`} onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open && (
        <>
          <div className="dlg-head"><h2>{title}</h2><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button></div>
          <div className="dlg-body">{children}</div>
          {footer && <div className="dlg-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function statusTone(s: string): Tone {
  switch (s) {
    case 'SENT': return 'green';
    case 'DRY_RUN': case 'PREVIEW': return 'navy';
    case 'FAILED': return 'red';
    case 'DUE': return 'amber';
    case 'SKIPPED': case 'NOT_DUE': default: return 'grey';
  }
}
export function statusLabel(s: string): string {
  return ({ SENT: 'Sent', DRY_RUN: 'Dry run', PREVIEW: 'Preview', FAILED: 'Failed', DUE: 'Due', NOT_DUE: 'Not due', SKIPPED: 'Skipped', ALREADY_DONE: 'Already done' } as Record<string, string>)[s] || s;
}

export function ErrorBox({ error }: { error: unknown }) {
  const msg = (error as Error)?.message || String(error);
  return <Banner tone="red">{msg}</Banner>;
}
