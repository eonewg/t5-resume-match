import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

export default function LibraryNav({
  kind,
  children,
  editing = false,
}: {
  kind: 'resume' | 'jobs';
  children?: ReactNode;
  editing?: boolean;
}) {
  const links =
    kind === 'resume'
      ? [
          ['/resume', '编辑简历'],
          ['/resume/history', '简历库'],
        ]
      : [
          ['/jobs/new', editing ? '编辑岗位' : '创建岗位'],
          ['/jobs', '岗位库'],
        ];
  return (
    <header className="page-heading workspace-heading">
      <nav className="library-nav" aria-label={kind === 'resume' ? '简历工作区' : '岗位工作区'}>
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <h1 tabIndex={-1}>{label}</h1>
                ) : (
                  <span className="library-title-label">{label}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      {children && <p className="page-intro">{children}</p>}
    </header>
  );
}
