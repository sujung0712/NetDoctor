import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import type { CopyCodeBlockProps } from '../types';

type CopyStatus = 'idle' | 'copied' | 'error';

async function copyTextSafely(text: string): Promise<boolean> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea copy fallback.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.select();

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  } finally {
    document.body.removeChild(textarea);
  }

  return succeeded;
}

export function CopyCodeBlock({ code, label, shell }: CopyCodeBlockProps) {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const ok = await copyTextSafely(code);
    setStatus(ok ? 'copied' : 'error');

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setStatus('idle');
      timerRef.current = null;
    }, 2000);
  };

  return (
    <div className="rounded-xl bg-[#060b14] border border-slate-800 overflow-hidden shadow-inner">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-[#0c1424] border-b border-slate-800/90">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal
            className="w-3.5 h-3.5 text-cyan-400 shrink-0"
            aria-hidden="true"
          />
          {shell && (
            <span className="inline-flex items-center rounded-md bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[11px] font-mono font-semibold text-cyan-200 shrink-0">
              {shell}
            </span>
          )}
          {label && (
            <span className="text-xs font-medium text-slate-300 truncate">
              {label}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={label ? `${label} 명령어 복사` : '명령어 복사'}
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-[#0c1424] ${
            status === 'copied'
              ? 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40'
              : status === 'error'
                ? 'bg-rose-500/15 text-rose-200 border-rose-500/40'
                : 'bg-[#162238] hover:bg-[#1e2f4d] text-slate-200 hover:text-white border-slate-700 hover:border-cyan-500/40'
          }`}
        >
          {status === 'copied' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" aria-hidden="true" />
              <span>복사됨</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
              <span>{status === 'error' ? '복사 실패' : '복사'}</span>
            </>
          )}
        </button>
      </div>

      <pre className="p-3.5 sm:p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-cyan-200">
        <code>{code}</code>
      </pre>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {status === 'copied'
          ? '명령어가 클립보드에 복사되었습니다.'
          : status === 'error'
            ? '클립보드 복사에 실패했습니다. 명령어를 직접 선택하여 복사하세요.'
            : ''}
      </span>
    </div>
  );
}
