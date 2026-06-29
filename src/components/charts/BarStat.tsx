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
  // Мало столбцов (месяцы=12, недели, годы) — показываем все подписи ровно под
  // столбцами. Много (дни=28–31) — прореживаем, иначе наедут друг на друга.
  const many = data.length > 16

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: many ? 10 : 9.5 }}
            interval={many ? 'preserveStartEnd' : 0}
            minTickGap={many ? 6 : 0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickMargin={6}
            tick={{ fill: c.faint, fontSize: 10 }}
            tickFormatter={(v) => fmtCompact(v as number)}
            allowDecimals={false}
          />
          <Bar dataKey="value" radius={[6, 6, 6, 6]} isAnimationActive={false} cursor="pointer">
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === selected && hasData ? c.accent : c.muted}
                onClick={() => onSelect(i)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
