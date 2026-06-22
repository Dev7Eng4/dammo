import { useState } from 'react';
import { Button } from '../ui';
import type { ProxyProvider } from '../../types/proxy';

interface ProxyProvidersTableProps {
  providers: ProxyProvider[];
  loading?: boolean;
  onEdit: (provider: ProxyProvider) => void;
  onDelete: (provider: ProxyProvider) => void;
}

function MaskedPassword({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs text-neutral-300">
        {visible ? value : '••••••••'}
      </span>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-neutral-500 hover:text-neutral-300"
        title={visible ? 'Hide password' : 'Show password'}
      >
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {visible ? (
            <>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </>
          ) : (
            <>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

export function ProxyProvidersTable({
  providers,
  loading,
  onEdit,
  onDelete,
}: ProxyProvidersTableProps) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-neutral-500">
              <th className="pb-3 pr-4 font-medium">NAME</th>
              <th className="pb-3 pr-4 font-medium">LOGIN URL</th>
              <th className="pb-3 pr-4 font-medium">USERNAME</th>
              <th className="pb-3 pr-4 font-medium">PASSWORD</th>
              <th className="pb-3 font-medium">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td colSpan={5} className="py-3">
                  <div className="h-4 animate-pulse rounded bg-neutral-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm text-neutral-400">No providers yet.</p>
        <p className="mt-1 text-xs text-neutral-500">Add a login URL, username, and password to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-neutral-500">
            <th className="pb-3 pr-4 font-medium">NAME</th>
            <th className="pb-3 pr-4 font-medium">LOGIN URL</th>
            <th className="pb-3 pr-4 font-medium">USERNAME</th>
            <th className="pb-3 pr-4 font-medium">PASSWORD</th>
            <th className="pb-3 font-medium">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => (
            <tr key={provider.id} className="border-b border-border/50">
              <td className="py-3 pr-4 font-medium text-neutral-100">{provider.name}</td>
              <td className="py-3 pr-4">
                {provider.loginUrl ? (
                  <a
                    href={provider.loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-400 hover:underline"
                  >
                    {provider.loginUrl}
                  </a>
                ) : (
                  <span className="text-neutral-500">—</span>
                )}
              </td>
              <td className="py-3 pr-4 text-neutral-300">{provider.username}</td>
              <td className="py-3 pr-4">
                <MaskedPassword value={provider.password} />
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <Button variant="outlined" size="sm" className="rounded-lg" onClick={() => onEdit(provider)}>
                    Edit
                  </Button>
                  <Button
                    variant="outlined"
                    size="sm"
                    className="rounded-lg border-danger/30 text-danger hover:bg-danger/10"
                    onClick={() => onDelete(provider)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
