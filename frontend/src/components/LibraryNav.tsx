import { NavLink } from 'react-router-dom';

export default function LibraryNav({ kind }: { kind: 'resume' | 'jobs' }) {
  const links =
    kind === 'resume'
      ? [
          ['/resume', '编辑简历'],
          ['/resume/history', '简历库'],
        ]
      : [
          ['/jobs/new', '创建岗位'],
          ['/jobs', '岗位库'],
        ];
  return (
    <nav className="library-nav" aria-label={kind === 'resume' ? '简历工作区' : '岗位工作区'}>
      {links.map(([to, label]) => (
        <NavLink key={to} to={to} end>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
