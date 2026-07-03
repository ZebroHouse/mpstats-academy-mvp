'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { UserTable } from '@/components/admin/UserTable';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search } from 'lucide-react';

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN' | 'SALES';

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch current user profile to determine role for privilege-aware controls
  const { data: myProfile } = trpc.profile.get.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const users = trpc.admin.getUsers.useQuery({
    search: debouncedSearch || undefined,
    page,
    limit,
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-heading-lg font-bold text-mp-gray-900">
            Users
          </h2>
          {users.data && (
            <Badge variant="primary" size="lg">
              {users.data.totalCount}
            </Badge>
          )}
        </div>
      </div>

      {/* Search + Table */}
      <Card className="overflow-hidden">
        {/* Search bar */}
        <div className="p-4 border-b border-mp-gray-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mp-gray-400" />
            <Input
              inputSize="sm"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Table content */}
        {users.isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24 ml-auto" />
              </div>
            ))}
          </div>
        ) : users.error ? (
          <div className="p-8 text-center">
            <p className="text-red-600 font-medium">Failed to load users</p>
            <p className="text-body-sm text-mp-gray-500 mt-1">{users.error.message}</p>
          </div>
        ) : (
          <UserTable
            users={users.data?.users ?? []}
            totalCount={users.data?.totalCount ?? 0}
            page={users.data?.page ?? 1}
            totalPages={users.data?.totalPages ?? 1}
            onPageChange={setPage}
            currentUserRole={(myProfile?.role as Role) ?? 'USER'}
            currentUserId={myProfile?.id ?? ''}
          />
        )}
      </Card>
    </div>
  );
}
