import { useState, useEffect, useMemo } from 'react'
import { getStates, getCities, createCity, updateCity, toggleCityStatus } from '../../../utils/api'
import type { State, City } from '../../../types'
import '../AdminShared.css'

// ── City form modal ───────────────────────────────────────────────────────────

interface CityModalProps {
  city:     City | null        // null = add mode
  states:   State[]
  onSave:   (name: string, stateId: string) => Promise<string | null>
  onClose:  () => void
}

function CityModal({ city, states, onSave, onClose }: CityModalProps) {
  const [name,    setName]    = useState(city?.name    ?? '')
  const [stateId, setStateId] = useState(city?.stateId ?? '')
  const [errors,  setErrors]  = useState<{ name?: string; stateId?: string }>({})
  const [saving,  setSaving]  = useState(false)
  const [apiErr,  setApiErr]  = useState<string | null>(null)

  function validate(): boolean {
    const e: typeof errors = {}
    if (!name.trim())  e.name    = 'City name is required'
    if (!stateId)      e.stateId = 'Please select a state'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setApiErr(null)
    const err = await onSave(name.trim(), stateId)
    setSaving(false)
    if (err) setApiErr(errorMessage(err))
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={handleKey}>
        <div className="modal__header">
          <h2 className="modal__title">{city ? 'Edit City' : 'Add City'}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal__body">
          {apiErr && <div className="alert alert--error" style={{ margin: '0 0 16px' }}>{apiErr}</div>}

          <div className="form-field">
            <label className="form-label">City Name <span>*</span></label>
            <input
              className={`form-input${errors.name ? ' form-input--error' : ''}`}
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })) }}
              placeholder="e.g. Chennai"
              autoFocus
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">State <span>*</span></label>
            <select
              className={`form-select${errors.stateId ? ' form-input--error' : ''}`}
              value={stateId}
              onChange={e => { setStateId(e.target.value); setErrors(p => ({ ...p, stateId: undefined })) }}
            >
              <option value="">— Select state —</option>
              {states.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.stateCode})</option>
              ))}
            </select>
            {errors.stateId && <span className="field-error">{errors.stateId}</span>}
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save City'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Error message map ─────────────────────────────────────────────────────────

function errorMessage(code: string): string {
  const map: Record<string, string> = {
    city_already_exists: 'A city with this name already exists in the selected state.',
    invalid_state:       'The selected state is invalid or inactive.',
    city_name_required:  'City name is required.',
    state_required:      'State is required.',
    network_error:       'Network error — please check your connection.',
  }
  return map[code] ?? 'Something went wrong, please try again.'
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function CitiesPanel() {
  const [cities,  setCities]  = useState<City[]>([])
  const [states,  setStates]  = useState<State[]>([])
  const [loading, setLoading] = useState(true)
  const [alert,   setAlert]   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const [search,       setSearch]       = useState('')
  const [stateFilter,  setStateFilter]  = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  const [modalOpen,   setModalOpen]   = useState(false)
  const [editingCity, setEditingCity] = useState<City | null>(null)
  const [togglingId,  setTogglingId]  = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getStates(), getCities()]).then(([sr, cr]) => {
      if (sr.success) setStates(sr.data)
      if (cr.success) setCities(cr.data)
      setLoading(false)
    })
  }, [])

  function showAlert(type: 'success' | 'error', msg: string) {
    setAlert({ type, msg })
    setTimeout(() => setAlert(null), 4000)
  }

  async function handleSave(name: string, stateId: string): Promise<string | null> {
    if (editingCity) {
      const res = await updateCity(editingCity.id, name, stateId)
      if (!res.success) return res.error
      setCities(prev => prev.map(c => c.id === res.data.id ? res.data : c))
      showAlert('success', `"${res.data.name}" updated successfully.`)
    } else {
      const res = await createCity(name, stateId)
      if (!res.success) return res.error
      setCities(prev => [...prev, res.data])
      showAlert('success', `"${res.data.name}" added successfully.`)
    }
    setModalOpen(false)
    setEditingCity(null)
    return null
  }

  async function handleToggle(city: City) {
    setTogglingId(city.id)
    const res = await toggleCityStatus(city.id, !city.isActive)
    setTogglingId(null)
    if (!res.success) { showAlert('error', errorMessage(res.error)); return }
    setCities(prev => prev.map(c => c.id === res.data.id ? { ...c, isActive: res.data.isActive } : c))
    showAlert('success', `"${city.name}" ${res.data.isActive ? 'activated' : 'deactivated'}.`)
  }

  function openAdd() {
    setEditingCity(null)
    setModalOpen(true)
  }

  function openEdit(city: City) {
    setEditingCity(city)
    setModalOpen(true)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return cities.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !c.stateName.toLowerCase().includes(q)) return false
      if (stateFilter && c.stateId !== stateFilter) return false
      if (statusFilter === 'active'   && !c.isActive) return false
      if (statusFilter === 'inactive' &&  c.isActive) return false
      return true
    })
  }, [cities, search, stateFilter, statusFilter])

  const uniqueStates = useMemo(() => {
    const seen = new Set<string>()
    return cities
      .filter(c => { if (seen.has(c.stateId)) return false; seen.add(c.stateId); return true })
      .map(c => ({ id: c.stateId, name: c.stateName }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [cities])

  return (
    <div className="panel-card admin-section">
      <h2 className="panel__title">Cities</h2>
      <p className="panel__subtitle">Manage the cities available for water delivery across states.</p>

      {alert && (
        <div className={`alert alert--${alert.type}`}>{alert.msg}</div>
      )}

      <div className="admin-card">
        {/* Header */}
        <div className="admin-card__header">
          <h3 className="admin-card__heading">
            Cities
            <span className="admin-card__count">
              {loading ? '' : `${filtered.length} of ${cities.length}`}
            </span>
          </h3>
          <button className="btn btn--primary" onClick={openAdd}>
            + Add City
          </button>
        </div>

        {/* Toolbar */}
        <div className="admin-toolbar">
          <div className="admin-search">
            <span className="admin-search__icon">⌕</span>
            <input
              className="admin-search__input"
              placeholder="Search city or state…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            className="admin-filter"
            value={stateFilter}
            onChange={e => setStateFilter(e.target.value)}
          >
            <option value="">All States</option>
            {uniqueStates.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            className="admin-filter"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="admin-empty">Loading cities…</div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <div className="admin-empty__icon">🏙️</div>
            {cities.length === 0 ? 'No cities added yet. Click "+ Add City" to get started.' : 'No cities match your filters.'}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>City Name</th>
                  <th>State</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((city, i) => (
                  <tr key={city.id}>
                    <td style={{ color: '#94a3b8', width: 48 }}>{i + 1}</td>
                    <td style={{ fontWeight: 500 }}>{city.name}</td>
                    <td>
                      {city.stateName}
                      <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 6 }}>
                        ({city.stateCode})
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge--${city.isActive ? 'active' : 'inactive'}`}>
                        {city.isActive ? '● Active' : '● Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-table__actions">
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => openEdit(city)}
                        >
                          ✎ Edit
                        </button>
                        <button
                          className={`btn btn--sm ${city.isActive ? 'btn--danger' : 'btn--success'}`}
                          onClick={() => handleToggle(city)}
                          disabled={togglingId === city.id}
                        >
                          {togglingId === city.id
                            ? '…'
                            : city.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {modalOpen && (
        <CityModal
          city={editingCity}
          states={states}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditingCity(null) }}
        />
      )}
    </div>
  )
}
