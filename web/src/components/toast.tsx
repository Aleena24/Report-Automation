import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Tone = 'info' | 'good' | 'bad';
interface Toast { id: number; msg: string; tone: Tone }
const Ctx = createContext<(msg: string, tone?: Tone) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const toast = useCallback((msg: string, tone: Tone = 'info') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), tone === 'bad' ? 7000 : 3500);
  }, []);
  const value = useMemo(() => toast, [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={`toast ${t.tone === 'info' ? '' : t.tone}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
