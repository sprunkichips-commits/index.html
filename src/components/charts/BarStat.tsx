import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useStore } from '@/store/StoreContext'
import { useChartColors } from '@/lib/useChartColors'
import { fmtCompact } from '@/lib/format'

export interface BarPoint {
  label: string
  value: number
}

/** Столбчатый график с одним выделенным (синим) столбцом. Клик выбирает столбец. */
export function BarStat({
  data,
  selected,
  onSelect,
  height = 200,
}: {
  data: BarPoint[]
  selected: number
  onSelect: (i: number) => void
  height?: number
}) {
  const { theme } = useStore()
  const c = useChartColors(theme)
  const hasData = data.some((d) => d.value > 0)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: 10 }}
            interval="preserveStartEnd"
            minTickGap={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={42}
            tick={{ fill: c.faint, fontSize: 10 }}
            tickFormatter={(v) => fmtCompact(v as number)}
            allowDecimals={false}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 6, 6]}
            isAnimationActive={false}
            onClick={(_, i) => onSelect(i)}
            cursor="pointer"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={i === selected && hasData ? c.accent : c.muted} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
