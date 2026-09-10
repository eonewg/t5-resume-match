import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
export function Button({
  tone = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button type="button" className={`button ${tone} ${className}`} {...props} />;
}
export function NextLink({
  to,
  children,
  id,
  primary = true,
}: {
  to: string;
  children: ReactNode;
  id?: string;
  primary?: boolean;
}) {
  return (
    <Link id={id} className={`button ${primary ? 'primary' : 'secondary'}`} to={to}>
      {children}
    </Link>
  );
}
export function Feedback({
  id,
  error,
  busy,
  children,
}: {
  id?: string;
  error?: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <p
      id={id}
      role={error ? 'alert' : 'status'}
      aria-live="polite"
      hidden={!error && !children}
      className="feedback"
      data-error={Boolean(error)}
      data-state={error ? 'error' : busy ? 'busy' : 'neutral'}
    >
      {error || children}
    </p>
  );
}
export function Chips({
  values,
  id,
  className = '',
  empty = '暂未提供',
}: {
  values: string[];
  id?: string;
  className?: string;
  empty?: string;
}) {
  return (
    <div id={id} className={`chips ${className}`}>
      {values.length ? (
        values.map((value, index) => (
          <span className="chip" key={index}>
            {value}
          </span>
        ))
      ) : (
        <span className="helper-text">{empty}</span>
      )}
    </div>
  );
}
export function PageHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="page-heading">
      <h1 tabIndex={-1}>{title}</h1>
      <p className="page-intro">{children}</p>
    </header>
  );
}
export function Empty({
  title,
  children,
  to,
  cta,
}: {
  title: string;
  children?: ReactNode;
  to: string;
  cta: string;
}) {
  return (
    <section className="product-empty">
      <h2>{title}</h2>
      <p>{children}</p>
      <NextLink to={to}>{cta} →</NextLink>
    </section>
  );
}
export function SafeSource({ url, children }: { url: string | null; children: ReactNode }) {
  try {
    const parsed = new URL(url || '');
    if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password)
      return (
        <a href={parsed.href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
  } catch {
    /* Text-only for unsafe or malformed URLs. */
  }
  return <span>{children}</span>;
}
