"use client";

import { useState, useEffect, useRef } from "react";

const EXAMPLES = [
  "Pre-seed mobility",
  "Family office foodtech",
  ">10M Series B",
];

export default function HeroBlock({
  query,
  onQueryChange,
  onSearch,
  onSuggestionsFetch,
  loading,
  suggestions,
  showSuggestions,
  suggestIndex,
  onSuggestIndexChange,
  onSelectSuggestion,
  onCloseSuggestions,
  searchHistory,
  showHistory,
  onShowHistory,
  onRemoveHistory,
  collapsed = false,
  hasSearched = false,
  onClear,
  filterContent,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  onSearch: (q: string) => void;
  onSuggestionsFetch: (v: string) => void;
  loading: boolean;
  suggestions: { text: string; type: string; subtext?: string }[];
  showSuggestions: boolean;
  suggestIndex: number;
  onSuggestIndexChange: (i: number) => void;
  onSelectSuggestion: (text: string) => void;
  onCloseSuggestions: () => void;
  searchHistory: string[];
  showHistory: boolean;
  onShowHistory: (show: boolean) => void;
  onRemoveHistory: (q: string) => void;
  collapsed?: boolean;
  hasSearched?: boolean;
  onClear?: () => void;
  filterContent?: React.ReactNode;
}) {
  const [animatedText, setAnimatedText] = useState("");
  const [exampleIdx, setExampleIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query) return;

    const example = EXAMPLES[exampleIdx];

    if (isTyping) {
      if (charIdx < example.length) {
        const timer = setTimeout(() => {
          setAnimatedText(example.slice(0, charIdx + 1));
          setCharIdx((c) => c + 1);
        }, 45);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          setIsFading(true);
          setTimeout(() => {
            setIsTyping(false);
            setCharIdx(0);
          }, 300);
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      const timer = setTimeout(() => {
        setExampleIdx((i) => (i + 1) % EXAMPLES.length);
        setAnimatedText("");
        setIsFading(false);
        setIsTyping(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [query, exampleIdx, charIdx, isTyping]);

  return (
    <div className={`es-hero${collapsed ? " es-hero--collapsed" : ""}`}>
      <h1 className="es-hero__title">Find the right investor</h1>
      <p className="es-hero__subtitle">
        Search among VC firms, family offices, angel investors and news articles
        about impact investments
      </p>

      <div className="es-hero__search-wrap">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            onSuggestionsFetch(e.target.value);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text").trim();
            if (pasted.length >= 3) {
              setTimeout(() => onSearch(pasted), 50);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (
                showSuggestions &&
                suggestIndex >= 0 &&
                suggestions[suggestIndex]
              ) {
                onSelectSuggestion(suggestions[suggestIndex].text);
              } else {
                onSearch(query);
                onCloseSuggestions();
              }
            } else if (e.key === "ArrowDown" && showSuggestions) {
              e.preventDefault();
              onSuggestIndexChange(
                Math.min(suggestIndex + 1, suggestions.length - 1),
              );
            } else if (e.key === "ArrowUp" && showSuggestions) {
              e.preventDefault();
              onSuggestIndexChange(Math.max(suggestIndex - 1, -1));
            } else if (e.key === "Escape") {
              onCloseSuggestions();
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0 && query.length >= 2) {
              // Re-show suggestions on focus
            }
            if (!query && searchHistory.length > 0) {
              onShowHistory(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => onShowHistory(false), 200);
          }}
          placeholder={query ? "" : ""}
          className={`es-hero__input${
            loading ? " es-hero__input--loading" : ""
          }`}
        />

        {/* Animated placeholder with fade between examples */}
        {!query && (
          <div
            className={`es-hero__placeholder${
              isFading ? " es-hero__placeholder--fading" : ""
            }`}
            onClick={() => inputRef.current?.focus()}
          >
            {animatedText}
            <span className="es-hero__cursor" />
          </div>
        )}

        {loading && <div className="es-hero__spinner" />}

        {/* Search / Clear button */}
        {query && !loading && !hasSearched && (
          <button
            className="es-hero__search-btn"
            onClick={() => onSearch(query)}
            aria-label="Search"
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        )}
        {query && !loading && hasSearched && onClear && (
          <button
            className="es-hero__search-btn es-hero__search-btn--clear"
            onClick={onClear}
            aria-label="Clear search"
            type="button"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="es-suggest">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelectSuggestion(s.text)}
                className={`es-suggest__item ${
                  i === suggestIndex ? "es-suggest__item--active" : ""
                }`}
              >
                <span className="es-suggest__icon">
                  {s.type === "investor"
                    ? "◆"
                    : s.type === "company"
                      ? "▸"
                      : s.type === "niche"
                        ? "●"
                        : s.type === "city"
                          ? "◎"
                          : "○"}
                </span>
                <span className="es-suggest__text">{s.text}</span>
                {s.subtext && (
                  <span className="es-suggest__subtext">{s.subtext}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search history dropdown */}
      {showHistory &&
        !showSuggestions &&
        searchHistory.length > 0 &&
        !query && (
          <div className="es-history">
            <span className="es-history__label">Recent searches</span>
            {searchHistory.map((h) => (
              <button
                key={h}
                className="es-history__item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onQueryChange(h);
                  onSearch(h);
                  onShowHistory(false);
                }}
              >
                <span className="es-history__icon">↻</span>
                {h}
                <span
                  className="es-history__remove"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRemoveHistory(h);
                  }}
                >
                  ✕
                </span>
              </button>
            ))}
          </div>
        )}

      <div className="es-hero__chips">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              onQueryChange(ex);
              onSearch(ex);
            }}
            className={`es-hero__chip${
              query === ex ? " es-hero__chip--active" : ""
            }`}
          >
            {ex}
          </button>
        ))}
      </div>
      {filterContent}
    </div>
  );
}
