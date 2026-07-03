'use client';

import { useState, useCallback } from 'react';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN' | 'SALES';

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  isActive: boolean;
  isTest: boolean;
  createdAt: Date;
  _count: { diagnosticSessions: number };
}

interface UserTableProps {
  users: UserRow[];
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  currentUserRole: Role;
  currentUserId: string;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        checked ? 'bg-mp-blue-500' : 'bg-mp-gray-300',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

const ROLE_LABELS: Record<Role, string> = {
  USER: 'User',
  ADMIN: 'Admin',
  SUPERADMIN: 'Super',
  SALES: 'Продажи',
};

const ROLE_COLORS: Record<Role, string> = {
  USER: 'bg-mp-gray-100 text-mp-gray-700',
  ADMIN: 'bg-mp-blue-100 text-mp-blue-700',
  SUPERADMIN: 'bg-mp-pink-100 text-mp-pink-700',
  SALES: 'bg-green-100 text-green-700',
};

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', ROLE_COLORS[role])}>
      {ROLE_LABELS[role]}
    </span>
  );
}

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
      disabled={disabled}
      className={cn(
        'text-xs font-medium px-2 py-1 rounded-md border-0 cursor-pointer transition-colors',
        ROLE_COLORS[value],
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <option value="USER">User</option>
      <option value="ADMIN">Admin</option>
      <option value="SUPERADMIN">Super</option>
      <option value="SALES">Продажи</option>
    </select>
  );
}

export function UserTable({ users, totalCount, page, totalPages, onPageChange, currentUserRole, currentUserId }: UserTableProps) {
  const utils = trpc.useUtils();

  const toggleField = trpc.admin.toggleUserField.useMutation({
    onSuccess: () => {
      utils.admin.getUsers.invalidate();
    },
  });

  const changeRole = trpc.admin.changeUserRole.useMutation({
    onSuccess: () => {
      utils.admin.getUsers.invalidate();
    },
  });

  // Optimistic state for isActive toggles
  const [optimisticActive, setOptimisticActive] = useState<Record<string, boolean>>({});
  // Optimistic state for isTest toggles
  const [optimisticTest, setOptimisticTest] = useState<Record<string, boolean>>({});
  // Optimistic state for role changes
  const [optimisticRole, setOptimisticRole] = useState<Record<string, Role>>({});

  const handleToggleActive = useCallback(
    (userId: string, currentValue: boolean) => {
      setOptimisticActive((prev) => ({ ...prev, [userId]: !currentValue }));

      toggleField.mutate(
        { userId, field: 'isActive' },
        {
          onError: () => {
            setOptimisticActive((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
          onSettled: () => {
            setOptimisticActive((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
        },
      );
    },
    [toggleField],
  );

  const handleToggleTest = useCallback(
    (userId: string, currentValue: boolean) => {
      setOptimisticTest((prev) => ({ ...prev, [userId]: !currentValue }));

      toggleField.mutate(
        { userId, field: 'isTest' },
        {
          onError: () => {
            setOptimisticTest((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
          onSettled: () => {
            setOptimisticTest((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
        },
      );
    },
    [toggleField],
  );

  const handleRoleChange = useCallback(
    (userId: string, newRole: Role) => {
      setOptimisticRole((prev) => ({ ...prev, [userId]: newRole }));

      changeRole.mutate(
        { userId, role: newRole },
        {
          onError: () => {
            setOptimisticRole((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
          onSettled: () => {
            setOptimisticRole((prev) => {
              const copy = { ...prev };
              delete copy[userId];
              return copy;
            });
          },
        },
      );
    },
    [changeRole],
  );

  const getActiveValue = (userId: string, serverValue: boolean) => {
    if (userId in optimisticActive) return optimisticActive[userId];
    return serverValue;
  };

  const getTestValue = (userId: string, serverValue: boolean) => {
    if (userId in optimisticTest) return optimisticTest[userId];
    return serverValue;
  };

  const getRoleValue = (userId: string, serverValue: Role) => {
    if (userId in optimisticRole) return optimisticRole[userId];
    return serverValue;
  };

  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-mp-gray-500">
        <p className="text-body-md">No users found</p>
      </div>
    );
  }

  return (
    <div>
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-mp-gray-200">
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider">Registered</th>
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider text-center">Diagnostics</th>
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider text-center">Active</th>
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider text-center">Тест</th>
              <th className="px-4 py-3 text-xs font-semibold text-mp-gray-500 uppercase tracking-wider text-center">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-mp-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-mp-gray-50 transition-colors">
                {/* Avatar + Name */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-mp-blue-100 flex items-center justify-center shrink-0">
                      <span className="text-xs font-medium text-mp-blue-700">
                        {(user.name?.[0] || '?').toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-body-sm font-medium text-mp-gray-900">
                        {user.name || 'Unnamed'}
                      </p>
                      <p className="text-xs text-mp-gray-400 truncate max-w-[250px]">
                        {user.email || `${user.id.slice(0, 8)}...`}
                      </p>
                    </div>
                  </div>
                </td>

                {/* Registration date */}
                <td className="px-4 py-3 text-body-sm text-mp-gray-600">
                  {formatDate(user.createdAt)}
                </td>

                {/* Diagnostics count */}
                <td className="px-4 py-3 text-center">
                  <span className="text-body-sm font-medium text-mp-gray-900">
                    {user._count.diagnosticSessions}
                  </span>
                </td>

                {/* isActive toggle — SUPERADMIN only */}
                <td className="px-4 py-3 text-center">
                  {currentUserRole === 'SUPERADMIN' ? (
                    <Toggle
                      checked={getActiveValue(user.id, user.isActive)}
                      onChange={() => handleToggleActive(user.id, user.isActive)}
                      disabled={toggleField.isPending || user.id === currentUserId}
                    />
                  ) : (
                    <span className={cn('text-xs font-medium', user.isActive ? 'text-mp-green-600' : 'text-mp-gray-400')}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  )}
                </td>

                {/* isTest toggle — SUPERADMIN only */}
                <td className="px-4 py-3 text-center">
                  {currentUserRole === 'SUPERADMIN' ? (
                    <Toggle
                      checked={getTestValue(user.id, user.isTest)}
                      onChange={() => handleToggleTest(user.id, user.isTest)}
                      disabled={toggleField.isPending || user.id === currentUserId}
                    />
                  ) : (
                    <span className={cn('text-xs font-medium', user.isTest ? 'text-amber-600' : 'text-mp-gray-400')}>
                      {user.isTest ? 'Тест' : '—'}
                    </span>
                  )}
                </td>

                {/* Role — dropdown for SUPERADMIN, badge for ADMIN */}
                <td className="px-4 py-3 text-center">
                  {currentUserRole === 'SUPERADMIN' ? (
                    <RoleSelect
                      value={getRoleValue(user.id, user.role)}
                      onChange={(role) => handleRoleChange(user.id, role)}
                      disabled={changeRole.isPending || user.id === currentUserId}
                    />
                  ) : (
                    <RoleBadge role={user.role} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-mp-gray-200">
        <p className="text-body-sm text-mp-gray-500">
          {totalCount} users total
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-body-sm text-mp-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-mp-gray-200 text-mp-gray-600 hover:bg-mp-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
