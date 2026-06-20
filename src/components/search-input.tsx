import type { InputHTMLAttributes } from "react";

type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> & {
  hint?: string;
  className?: string;
};

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="w-4 h-4 text-dpm-muted shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

export function SearchInput({
  hint,
  className = "",
  ...props
}: SearchInputProps) {
  return (
    <div className={`dpm-search ${className}`.trim()}>
      <SearchIcon />
      <input type="search" {...props} />
      {hint && (
        <span className="hidden sm:inline-flex dpm-kbd text-[10px] shrink-0">
          {hint}
        </span>
      )}
    </div>
  );
}
