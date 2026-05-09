import { FormEvent, useState } from "react";

type SearchBarProps = {
  onSearch: (query: string) => void;
  isLoading: boolean;
};

export function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState(
    "鎌倉で海、カフェ、寺をめぐる日帰りさんぽ",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      onSearch(trimmedQuery);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center"
    >
      <label className="sr-only" htmlFor="travel-query">
        旅行プランの希望
      </label>
      <div className="flex min-h-14 flex-1 items-center gap-3 rounded-xl px-3">
        <span className="text-slate-400" aria-hidden="true">
          ⌕
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-400">行き先を自然文で検索</p>
          <input
            id="travel-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例: 京都で寺社巡りとカフェを楽しむ日帰り旅行"
            className="mt-0.5 w-full bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400"
            disabled={isLoading}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className="min-h-12 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_20px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isLoading ? "作成中..." : "✦ プランを作成"}
      </button>
    </form>
  );
}
