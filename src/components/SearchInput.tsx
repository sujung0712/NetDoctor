import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import type { SearchInputProps } from '../types';

export function SearchInput({
  value,
  onChange,
  placeholder = '검색어를 입력하세요...',
  ariaLabel = '검색',
  maxLength,
  className = '',
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={`relative w-full ${className}`.trim()}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        className="w-full rounded-xl bg-[#0b1220] border border-slate-700/90 hover:border-slate-600 pl-10 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-400 transition-colors focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/25 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="검색어 지우기"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
