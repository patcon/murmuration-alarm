export function RadioRow({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span>{label}</span>
      <div style={{ display: 'flex', gap: 12 }}>
        {options.map(opt => (
          <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input
              type="radio" name={label} value={opt.value} checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              style={{ accentColor: 'dodgerblue', width: 14, height: 14 }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
