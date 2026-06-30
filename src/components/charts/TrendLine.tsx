import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { useStore } from '@/store/StoreContext'
import { useChartColors } from '@/lib/useChartColors'

export interface TrendPoint {
  label: string
  percent: number
}

/** Линия выполнения целей по дням (в %), стиль как в YouTube Studio. */
export function TrendLine({ data, height = 190 }: { data: TrendPoint[]; height?: number }) {
  const { theme } = useStore()
  const c = useChartColors(theme)
  const many = data.length > 12
  const step = many ? Math.ceil(data.length / 6) - 1 : 0

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: 10 }}
            interval={step}
            minTickGap={4}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tickMargin={6}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: c.faint, fontSize: 10 }}
            tickFormatter={(v) => `${v}%`}
          />
          <Area
            type="monotone"
            dataKey="percent"
            stroke={c.accent}
            strokeWidth={2.5}
            fill="url(#trendFill)"
            isAnimationActive={false}
            dot={{ r: 2.5, fill: c.accent, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
