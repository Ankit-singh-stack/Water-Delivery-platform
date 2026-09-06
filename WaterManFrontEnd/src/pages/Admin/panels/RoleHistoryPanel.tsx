import { useQuery } from '@tanstack/react-query'
import { getRoleHistory } from '../../../utils/api'
import '../AdminShared.css'

function roleLabel(role: string | null): string {
  if (!role) return '—'
  return role === 'vendor' ? 'Vendor' : role === 'admin' ? 'Admin' : role === 'super_admin' ? 'Super Admin' : 'User'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function RoleHistoryPanel() {
  const { data: history = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'roleHistory'],
    queryFn: async () => {
      const res = await getRoleHistory()
      if (!res.success) throw new Error(res.error)
      return res.data
    },
  })

  return (
    <div className="panel-card admin-section">
      <h2 className="panel__title">Role History</h2>
      <p className="panel__subtitle">Audit log of every role reassignment made by an admin or super admin.</p>

      {isError && <div className="alert alert--error">Failed to load role history.</div>}

      <div className="admin-card">
        <div className="admin-card__header">
          <h3 className="admin-card__heading">
            Changes
            <span className="admin-card__count">{isLoading ? '' : history.length}</span>
          </h3>
        </div>

        {isLoading ? (
          <div className="admin-empty">Loading history…</div>
        ) : history.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty__icon">🕘</div>
            No role changes yet.
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Old Role</th>
                  <th>New Role</th>
                  <th>Changed By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 500 }}>{h.userName}<div style={{ color: '#94a3b8', fontSize: 12 }}>{h.userPhone}</div></td>
                    <td><span className={`badge badge--${h.oldRole ?? 'user'}`}>{roleLabel(h.oldRole)}</span></td>
                    <td><span className={`badge badge--${h.newRole ?? 'user'}`}>{roleLabel(h.newRole)}</span></td>
                    <td>{h.changedByName}</td>
                    <td style={{ color: '#64748b' }}>{formatDate(h.createdAt)}</td>
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
