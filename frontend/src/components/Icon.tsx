const paths = {
  power: 'M12 2v10m-6-7a9 9 0 1 0 12 0',
  panel: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM9 3v18',
  home: 'm3 10 9-7 9 7v10h-6v-7H9v7H3Z',
  resume: 'M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6',
  history: 'M3 3h18v6H3ZM7 3v6m10-6v6M3 9v11h8m7-7a4 4 0 1 0 0 8 4 4 0 0 0 0-8m0 2v2l2 1',
  jobs: 'M8 7V4h8v3M3 7h18v14H3Zm0 5 9 3 9-3M10 12h4',
  matching: 'M4 3h16v18H4ZM8 11l3 4 5-7',
  diagnosis: 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4ZM20 2v4m-2-2h4',
  analytics: 'M3 4h12v12H3Zm6 4h12v12H9Z',
  chart: 'M4 20v-6h3v6Zm6 0V8h3v12Zm6 0V3h3v17Z',
  trend: 'm3 18 6-7 4 4 8-11M16 4h5v5',
  target: 'M20 12a8 8 0 1 1-8-8m4 8a4 4 0 1 1-4-4m0 4L22 2m-5 0v5h5',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  upload: 'M7 17H5a4 4 0 0 1-1-8 8 8 0 0 1 15 0 4 4 0 0 1 0 8h-2m-5 4V10m-4 4 4-4 4 4',
  education: 'm2 9 10-5 10 5-10 5Zm4 2v7q6 5 12 0v-7m4-2v8',
  refresh: 'M20 4v6h-6m6 0a8 8 0 1 0 0 6',
  trash: 'M3 6h18M8 6V3h8v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  swap: 'M3 7h18l-4-4M21 17H3l4 4',
  check: 'm5 12 4 4L19 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 7v6m0-10v1',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m-3 6a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1',
  settings:
    'm9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  close: 'm6 6 12 12M6 18 18 6',
} as const;
export type IconName = keyof typeof paths;
export default function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
