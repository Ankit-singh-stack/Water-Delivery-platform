import { useState, useEffect, useRef, useMemo } from 'react'
import { getAdminTankerTypes, createTankerType, updateTankerType, toggleTankerTypeStatus, uploadTankerImage } from '../../../utils/api'
import type { TankerType } from '../../../types'
import '../AdminShared.css'

const API_BASE = (import.meta.env.SITE_API_URL as string | undefined) ?? 'http://localhost:3000'
function imgSrc(url: string | null | undefined) {
  if (!url) return null
  return url.startsWith('http') ? url : `${API_BASE}${url}`
}

interface TankerModalProps {
  tanker:  TankerType | null
  onSave:  (input: { name: string; capacityLitres: number; basePrice: number; displayOrder: number; imageUrl?: string | null }) => Promise<string | null>
  onClose: () => void
}

function TankerModal({ tanker, onSave, onClose }: TankerModalProps) {
  const [name,        setName]        = useState(tanker?.name                  ?? '')
  const [capacityStr, setCapacityStr] = useState(tanker?.capacityLitres.toString() ?? '')
  const [priceStr,    setPriceStr]    = useState(tanker?.basePrice.toString()       ?? '')
  const [orderStr,    setOrderStr]    = useState(tanker?.displayOrder.toString()    ?? '0')
  const [imageUrl,    setImageUrl]    = useState<string | null>(tanker?.imageUrl ?? null)
  const [preview,     setPreview]     = useState<string | null>(imgSrc(tanker?.imageUrl))
  const [uploading,   setUploading]   = useState(false)
  const [uploadErr,   setUploadErr]   = useState('')
  const [errors,      setErrors]      = useState<Partial<Record<'name' | 'capacity' | 'price', string>>>({})
  const [saving,      setSaving]      = useState(false)
  const [apiErr,      setApiErr]      = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function validate(): boolean {
    const e: typeof errors = {}
    if (!name.trim())               e.name     = 'Name is required'
    if (!capacityStr || isNaN(Number(capacityStr)) || Number(capacityStr) <= 0) e.capacity = 'Valid capacity required'
    if (!priceStr    || isNaN(Number(priceStr))    || Number(priceStr)    <= 0) e.price    = 'Valid price required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    const res = await uploadTankerImage(file)
    setUploading(false)
    if (res.success) { setImageUrl(res.data.imageUrl) }
    else { setUploadErr(res.error); setPreview(imgSrc(imageUrl)) }
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    setApiErr(null)
    const err = await onSave({
      name:           name.trim(),
      capacityLitres: parseInt(capacityStr),
      basePrice:      parseFloat(priceStr),
      displayOrder:   parseInt(orderStr || '0'),
      imageUrl,
    })
    setSaving(false)
    if (err) setApiErr(err)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void handleSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onKeyDown={handleKey}>
        <div className="modal__header">
          <h2 className="modal__title">{tanker ? 'Edit Tanker Type' : 'Add Tanker Type'}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal__body">
          {apiErr && <div className="alert alert--error" style={{ margin: '0 0 16px' }}>{apiErr}</div>}

          {/* Image upload */}
          <div className="form-field">
            <label className="form-label">Tanker Image</label>
            <div className="tt-img-upload">
              {preview ? (
                <img src={preview} alt="preview" className="tt-img-preview" />
              ) : (
                <div className="tt-img-placeholder">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>No image</span>
                </div>
              )}
              <div className="tt-img-actions">
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : preview ? 'Change Image' : 'Upload Image'}
                </button>
                {preview && (
                  <button type="button" className="btn btn--sm btn--danger" onClick={() => { setPreview(null); setImageUrl(null) }}>
                    Remove
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={handleImageChange} />
            </div>
            {uploadErr && <span className="field-error">{uploadErr}</span>}
          </div>

          <div className="form-field">
            <label className="form-label">Name <span>*</span></label>
            <input
              className={`form-input${errors.name ? ' form-input--error' : ''}`}
              value={name}
              onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })) }}
              placeholder="e.g. Standard Tanker"
              autoFocus
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label className="form-label">Capacity (Litres) <span>*</span></label>
              <input
                className={`form-input${errors.capacity ? ' form-input--error' : ''}`}
                type="number" min="1"
                value={capacityStr}
                onChange={e => { setCapacityStr(e.target.value); setErrors(p => ({ ...p, capacity: undefined })) }}
                placeholder="e.g. 6000"
              />
              {errors.capacity && <span className="field-error">{errors.capacity}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">Base Price (₹) <span>*</span></label>
              <input
                className={`form-input${errors.price ? ' form-input--error' : ''}`}
                type="number" min="1" step="0.01"
                value={priceStr}
                onChange={e => { setPriceStr(e.target.value); setErrors(p => ({ ...p, price: undefined })) }}
                placeholder="e.g. 1200"
              />
              {errors.price && <span className="field-error">{errors.price}</span>}
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Display Order</label>
            <input
              className="form-input"
              type="number" min="0"
              value={orderStr}
              onChange={e => setOrderStr(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="modal__footer">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving || uploading}>Cancel</button>
          <button className="btn btn--primary" onClick={() => void handleSave()} disabled={saving || uploading}>
            {saving ? 'Saving…' : tanker ? 'Save Changes' : 'Add Tanker Type'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TankerTypesPanel() {
  const [tankers, setTankers] = useState<TankerType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editTarget, setEditTarget] = useState<TankerType | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await getAdminTankerTypes()
    if (res.success) setTankers(res.data)
    setLoading(false)
  }

  function openAdd() { setEditTarget(null); setShowModal(true) }
  function openEdit(t: TankerType) { setEditTarget(t); setShowModal(true) }
  function closeModal() { setShowModal(false); setEditTarget(null) }

  async function handleSave(input: { name: string; capacityLitres: number; basePrice: number; displayOrder: number; imageUrl?: string | null }): Promise<string | null> {
    const res = editTarget
      ? await updateTankerType(editTarget.id, input)
      : await createTankerType(input)
    if (!res.success) return res.error
    await load()
    closeModal()
    return null
  }

  async function handleToggle(t: TankerType) {
    setTogglingId(t.id)
    const res = await toggleTankerTypeStatus(t.id, !t.isActive)
    if (res.success) {
      setTankers(prev => prev.map(x => x.id === t.id ? res.data : x))
    } else {
      setError(res.error)
    }
    setTogglingId(null)
  }

  const { active, inactive } = useMemo(() => ({
    active:   tankers.filter(t =>  t.isActive).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    inactive: tankers.filter(t => !t.isActive).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
  }), [tankers])

  function renderRows(list: TankerType[]) {
    return list.map(t => (
      <tr key={t.id} className={!t.isActive ? 'tt-row--inactive' : ''}>
        <td>
          {imgSrc(t.imageUrl)
            ? <img src={imgSrc(t.imageUrl)!} alt={t.name} className="tt-thumb" />
            : <div className="tt-thumb-empty">🚛</div>
          }
        </td>
        <td className="tt-td--name">{t.name}</td>
        <td>{(t.capacityLitres / 1000).toFixed(t.capacityLitres % 1000 === 0 ? 0 : 1)}K L</td>
        <td>₹{t.basePrice.toLocaleString('en-IN')}</td>
        <td>{t.displayOrder}</td>
        <td className="tt-td--actions">
          <button className="btn btn--sm btn--ghost" onClick={() => openEdit(t)}>Edit</button>
          <button
            className={`btn btn--sm ${t.isActive ? 'btn--danger' : 'btn--success'}`}
            onClick={() => handleToggle(t)}
            disabled={togglingId === t.id}
          >
            {togglingId === t.id ? '…' : t.isActive ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>
    ))
  }

  return (
    <div className="panel-card admin-section">
      <div className="tt-header">
        <div>
          <h2 className="tt-title">Tanker Types</h2>
          <p className="tt-sub">Manage available tanker sizes and pricing</p>
        </div>
        <button className="btn btn--primary" onClick={openAdd}>+ Add Tanker Type</button>
      </div>

      {error && <div className="alert alert--error" style={{ marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div className="tt-loading">Loading…</div>
      ) : (
        <div className="tt-table-wrap">
          <table className="tt-table">
            <thead>
              <tr>
                <th style={{ width: 56 }}>Image</th>
                <th>Name</th>
                <th>Capacity</th>
                <th>Base Price</th>
                <th>Order</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tankers.length === 0 ? (
                <tr><td colSpan={6} className="tt-empty">No tanker types yet. Click "+ Add Tanker Type" to get started.</td></tr>
              ) : (
                <>
                  {active.length > 0 && (
                    <>
                      <tr className="tt-group-row tt-group-row--active">
                        <td colSpan={6}>
                          <span className="tt-group-label">
                            <span className="tt-group-dot tt-group-dot--active" />
                            Active <span className="tt-group-count">{active.length}</span>
                          </span>
                        </td>
                      </tr>
                      {renderRows(active)}
                    </>
                  )}
                  {inactive.length > 0 && (
                    <>
                      <tr className="tt-group-row tt-group-row--inactive">
                        <td colSpan={6}>
                          <span className="tt-group-label">
                            <span className="tt-group-dot tt-group-dot--inactive" />
                            Inactive <span className="tt-group-count">{inactive.length}</span>
                          </span>
                        </td>
                      </tr>
                      {renderRows(inactive)}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TankerModal
          tanker={editTarget}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  )
}
