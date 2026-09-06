const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed:           { bg: 'bg-slate-500/15', text: 'text-slate-400',  dot: 'bg-slate-400' },
  accepted:            { bg: 'bg-blue-500/15',  text: 'text-blue-400',   dot: 'bg-blue-400' },
  preparing:           { bg: 'bg-amber-500/15', text: 'text-amber-400',  dot: 'bg-amber-400' },
  ready_for_pickup:    { bg: 'bg-orange-500/15',text: 'text-orange-400', dot: 'bg-orange-400' },
  assigned:            { bg: 'bg-purple-500/15',text: 'text-purple-400', dot: 'bg-purple-400' },
  delivery_accepted:   { bg: 'bg-violet-500/15',text: 'text-violet-400', dot: 'bg-violet-400' },
  arrived_at_pickup:   { bg: 'bg-indigo-500/15',text: 'text-indigo-400', dot: 'bg-indigo-400' },
  picked_up:           { bg: 'bg-cyan-500/15',  text: 'text-cyan-400',   dot: 'bg-cyan-400' },
  in_transit:          { bg: 'bg-teal-500/15',  text: 'text-teal-400',   dot: 'bg-teal-400' },
  out_for_delivery:    { bg: 'bg-emerald-500/15',text:'text-emerald-400', dot: 'bg-emerald-400' },
  arrived_at_customer: { bg: 'bg-green-500/15', text: 'text-green-400',  dot: 'bg-green-400' },
  delivered:           { bg: 'bg-brand-teal/15',text: 'text-brand-teal',  dot: 'bg-brand-teal' },
  failed:              { bg: 'bg-red-500/15',   text: 'text-red-400',    dot: 'bg-red-400' },
  rejected:            { bg: 'bg-red-500/15',   text: 'text-red-400',    dot: 'bg-red-400' },
  cancelled:           { bg: 'bg-gray-500/15',  text: 'text-gray-400',   dot: 'bg-gray-400' },
  draft:               { bg: 'bg-gray-500/10',  text: 'text-gray-500',   dot: 'bg-gray-500' },
}

const STATUS_LABELS: Record<string, string> = {
  confirmed:           'Awaiting',
  accepted:            'Accepted',
  preparing:           'Preparing',
  ready_for_pickup:    'Ready',
  assigned:            'Assigned',
  delivery_accepted:   'Delivery Accepted',
  arrived_at_pickup:   'At Pickup',
  picked_up:           'Picked Up',
  in_transit:          'In Transit',
  out_for_delivery:    'Out for Delivery',
  arrived_at_customer: 'Arrived',
  delivered:           'Delivered',
  failed:              'Failed',
  rejected:            'Rejected',
  cancelled:           'Cancelled',
  draft:               'Draft',
}

interface StatusBadgeProps {
  status: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function StatusBadge({ status, className = '', size = 'md' }: StatusBadgeProps) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.confirmed
  const sizeCls = size === 'sm' ? 'px-2 py-0.5 text-[9px]' : size === 'lg' ? 'px-3 py-1.5 text-xs' : 'px-2.5 py-1 text-[11px]'
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider ${sizeCls} ${colors.bg} ${colors.text} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
