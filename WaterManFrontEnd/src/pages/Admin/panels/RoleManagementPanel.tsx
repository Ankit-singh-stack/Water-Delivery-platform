import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getManagedUsers, updateUserRole, getSession } from '../../../utils/api'
import type { AssignableRole, ManagedUser } from '../../../types'
import '../AdminShared.css'

interface RoleManagementPanelProps {
  isSuperAdmin: boolean
}

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    role_not_assignable:    'You are not allowed to assign that role.',
    target_not_editable:    'This account cannot be changed from here.',
    cannot_change_own_role: 'You cannot change your own role.',
    user_not_found:         'User not found.',
    invalid_role:           'That role does not exist.',
    network_error:          'Network error — please check your connection.',
  }
  return map[code] ?? 'Something went wrong, please try again.'
}

function roleLabel(role: string): string {
  return role === 'vendor' ? 'Vendor' : role === 'admin' ? 'Admin' : role === 'super_admin' ? 'Super Admin' : 'User'
}

export default function RoleManagementPanel({ isSuperAdmin }: RoleManagementPanelProps) {
  const queryClient = useQueryClient()
  const currentUserId = getSession()?.userId
  const [search, setSearch]   = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'vendor' | 'admin' | 'super_admin'>('all')
  const [alert, setAlert]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await getManagedUsers()
      if (!res.success) throw new Error(res.error)
      return res.data
    },
  })

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) => updateUserRole(userId, role),
    onSuccess: (res) => {
      setSavingId(null)
      if (!res.success) { showAlert('error', errorMessage(res.error)); return }
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'roleHistory'] })
      showAlert('success', `Role updated to "${roleLabel(res.data.role)}".`)
    },
    onError: () => {
      setSavingId(null)
      showAlert('error', 'Something went wrong, please try again.')
    },
  })

  function showAlert(type: 'success' | 'error', msg: string) {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 4000)
  }

  function handleRoleChange(user: ManagedUser, role: AssignableRole) {
    if (role === user.role) return
    setSavingId(user.id)
    mutation.mutate({ userId: user.id, role })
  }

  const assignableRoles: AssignableRole[] = isSuperAdmin
    ? ['user', 'vendor', 'admin', 'super_admin']
    : ['user', 'vendor', 'admin']

  // admin cannot edit an account that is currently super_admin; nobody can edit their own role
  function isRowLocked(user: ManagedUser): boolean {
    if (user.id === currentUserId) return true
    if (!isSuperAdmin && user.role === 'super_admin') return true
    return false
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      const name = `${u.firstName} ${u.lastName}`.toLowerCase()
      if (q && !name.includes(q) && !u.phone.includes(q) && !(u.email ?? '').toLowerCase().includes(q)) return false
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      return true
    })
  }, [users, search, roleFilter])

  return (
    <div className="panel-card admin-section">
      <h2 className="panel__title">Role Management</h2>
      <p className="panel__subtitle">
        {isSuperAdmin
          ? 'View every account and reassign any account to any role.'
          : 'View every account and reassign roles among customer, vendor, and admin.'}
      </p>

      {alert && <div className={`alert alert--${alert.type}`}>{alert.msg}</div>}

      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__heading">
            Accounts
            <span className="admin-card__count">
              {isLoading ? '' : `${filtered.length} of ${users.length}`}
            </span>
          </h3>
        </div>

        <div className="admin-toolbar">
          <div className="admin-search">
            <span className="admin-search__icon">⌕</span>
            <input
              className="admin-search__input"
              placeholder="Search name, phone, or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-filter"
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
          >
            <option value="all">All Roles</option>
            <option value="user">User</option>
            <option value="vendor">Vendor</option>
            <option value="admin">Admin</option>
            {isSuperAdmin && <option value="super_admin">Super Admin</option>}
          </select>
        </div>

        {isLoading ? (
          <div className="admin-empty">Loading accounts…</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty__icon">👤</div>
            {users.length === 0 ? 'No accounts to manage yet.' : 'No accounts match your filters.'}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Change Role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.firstName} {u.lastName}</td>
                    <td>{u.phone}</td>
                    <td>{u.email ?? '—'}</td>
                    <td>
                      <span className={`badge badge--${u.role}`}>{roleLabel(u.role)}</span>
                    </td>
                    <td>
                      {isRowLocked(u) ? (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                          {u.id === currentUserId ? 'This is you' : 'Not editable'}
                        </span>
                      ) : (
                        <>
                          <select
                            className="admin-role-select"
                            value={u.role}
                            disabled={savingId === u.id}
                            onChange={e => handleRoleChange(u, e.target.value as AssignableRole)}
                          >
                            {assignableRoles.map(r => (
                              <option key={r} value={r}>{roleLabel(r)}</option>
                            ))}
                            {!assignableRoles.includes(u.role) && (
                              <option value={u.role}>{roleLabel(u.role)}</option>
                            )}
                          </select>
                          {savingId === u.id && <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>Saving…</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
