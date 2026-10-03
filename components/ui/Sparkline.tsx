// Mini-grafic de tendinta (fara axe), pentru ultimele luni. Ultimul punct e evidentiat.
export default function Sparkline({ values, color = 'var(--accent)', title }: { values: number[]; color?: string; title?: string }) {
  if (values.length < 2) return null
  const w = 100, h = 28, pad = 3
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [pad + (i * (w - pad * 2)) / (values.length - 1), h - pad - ((v - min) / span) * (h - pad * 2)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(2)},${h} L${pts[0][0].toFixed(2)},${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={title || 'Tendință'}>
      <path className="area" d={area} fill={color} />
      <path className="line" d={line} stroke={color} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
