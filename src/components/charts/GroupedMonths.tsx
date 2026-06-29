import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { type MonthPoint } from '@/lib/data'
import { useStore } from '@/store/StoreContext'
import { useChartColors } from '@/lib/useChartColors'
import { fmtCompact } from '@/lib/format'

/** Доходы (зелёный) и расходы (красный) по месяцам — сгруппированные столбцы. */
export function GroupedMonths({ data, height = 190 }: { data: MonthPoint[]; height?: number }) {
  const { theme } = useStore()
  const c = useChartColors(theme)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%" barGap={2}>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: 9.5 }}
            interval={0}
            minTickGap={2}
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
          <Bar dataKey="in" radius={[3, 3, 0, 0]} fill={c.pos} isAnimationActive={false} />
          <Bar dataKey="ex" radius={[3, 3, 0, 0]} fill={c.neg} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
