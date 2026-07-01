import { FormEvent, useState } from "react";

type SearchBarProps = {
  onSearch: (query: string) => void;
  isLoading: boolean;
  disabled?: boolean;
  initialQuery?: string;
};

const conditionChips = ["日帰り", "週末", "カフェ", "子連れ", "雨の日"];

export function SearchBar({
  onSearch,
  isLoading,
  disabled = false,
  initialQuery,
}: SearchBarProps) {
  const [query, setQuery] = useState(
    initialQuery ?? "鎌倉で海、カフェ、寺をめぐる日帰りさんぽ",
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();

    if (trimmedQuery && !disabled) {
      onSearch(trimmedQuery);
    }
  }

  function appendChip(chip: string) {
    setQuery((current) => {
      if (current.includes(chip)) {
        return current;
      }

      return `${current.trim()} ${chip}`.trim();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3"
    >
      <label className="sr-only" htmlFor="travel-query">
        旅行プランの希望
      </label>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
        <div className="flex min-h-14 items-start gap-3 rounded-xl">
          <span className="mt-1 text-slate-400" aria-hidden="true">
            ⌕
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-400">旅行希望を自然文で入力</p>
            <textarea
              id="travel-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例: 京都で寺社巡りとカフェを楽しむ日帰り旅行"
              className="mt-1 min-h-24 w-full resize-none bg-transparent text-base font-semibold leading-7 text-slate-950 outline-none placeholder:text-slate-400"
              disabled={isLoading || disabled}
            />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {conditionChips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => appendChip(chip)}
            disabled={isLoading || disabled}
            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {chip}
          </button>
        ))}
      </div>
      <button
        type="submit"
        disabled={isLoading || disabled}
        className="min-h-12 rounded-xl bg-blue-600 px-6 text-sm font-bold text-white shadow-[0_10px_20px_rgba(37,99,235,0.24)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
      >
        {isLoading ? "作成中..." : "プランを作成"}
      </button>
    </form>
  );
}
