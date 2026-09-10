import { useEffect, useId, useRef, useState } from 'react';

interface Choice {
  value: string;
  label: string;
  detail?: string;
  search?: string;
}
export default function SearchSelect({
  id,
  value,
  choices,
  placeholder,
  disabled,
  fallback,
  onChange,
}: {
  id: string;
  value: string;
  choices: Choice[];
  placeholder: string;
  disabled?: boolean;
  fallback?: string;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const selected = choices.find((choice) => choice.value === value);
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  const matches = choices.filter((choice) =>
    `${choice.label} ${choice.detail || ''} ${choice.search || ''}`
      .normalize('NFKC')
      .toLocaleLowerCase()
      .includes(normalized),
  );
  const visible = matches.slice(0, 80);
  const current = Math.min(active, Math.max(0, visible.length - 1));
  useEffect(() => {
    list.current?.children[current]?.scrollIntoView?.({ block: 'nearest' });
  }, [current]);
  const choose = (choice: Choice) => {
    onChange(choice.value);
    setOpen(false);
    setQuery('');
  };
  return (
    <div
      className="search-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && visible.length ? `${listId}-${current}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : selected?.label || (value ? fallback || '' : '')}
        onFocus={() => {
          setQuery('');
          setActive(0);
          setOpen(true);
        }}
        onClick={() => {
          if (!open) {
            setQuery('');
            setActive(0);
            setOpen(true);
          }
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive(
              open
                ? Math.max(
                    0,
                    Math.min(visible.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)),
                  )
                : 0,
            );
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (visible[current]) choose(visible[current]);
          }
        }}
      />
      <span className="search-select-arrow" aria-hidden="true">
        ⌄
      </span>
      {open && (
        <div className="search-select-popup">
          <p>输入关键词快速查找 · {matches.length} 项</p>
          <ul id={listId} role="listbox" ref={list} aria-label="搜索结果">
            {visible.map((choice, index) => (
              <li
                key={choice.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={value === choice.value}
                data-active={index === current}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(choice)}
              >
                <strong>{choice.label}</strong>
                {choice.detail && <small>{choice.detail}</small>}
              </li>
            ))}
          </ul>
          {!matches.length && <p role="status">没有匹配结果，请尝试其他关键词。</p>}
          {matches.length > 80 && <p>显示前 80 项，继续输入可缩小范围。</p>}
        </div>
      )}
    </div>
  );
}
