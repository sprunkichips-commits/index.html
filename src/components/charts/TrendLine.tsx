import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '@/store/StoreContext'
import { useChartColors } from '@/lib/useChartColors'

export interface TrendPoint {
  date: string // YYYY-MM-DD
  percent: number
}

const DT_TICK = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

function fmtTickDate(dateStr: string, withMonth: boolean): string {
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  return withMonth ? DT_TICK.format(d) : String(d.getDate())
}

// Геометрия графика — нужна и разметке, и фолбэку выбора дня по координате клика.
const MARGIN = { top: 12, right: 10, left: 0, bottom: 0 }
const Y_AXIS_W = 40

/**
 * Линия выполнения целей по дням (в %). Строго прямые отрезки (linear, не волны),
 * тап/клик по дню выбирает его — детали показывает родитель (Goals).
 */
export function TrendLine({
  data,
  selected,
  onSelect,
  height = 190,
}: {
  data: TrendPoint[]
  selected?: string | null
  onSelect?: (date: string) => void
  height?: number
}) {
  const { theme } = useStore()
  const c = useChartColors(theme)
  const span = data.length
  const step = span > 12 ? Math.ceil(span / 6) - 1 : 0
  const longRange = span > 35 // подписи «Jun 12» вместо голого числа дня
  const showDots = span <= 45

  const renderDot = (props: { cx?: number; cy?: number; index?: number; payload?: TrendPoint }) => {
    const { cx, cy, index, payload } = props
    const sel = !!selected && payload?.date === selected
    // r=0 — точки скрыты на длинных диапазонах, но выбранная видна всегда
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={sel ? 5 : showDots ? 2.5 : 0}
        fill={c.accent}
        stroke={sel ? c.bg : 'none'}
        strokeWidth={sel ? 2 : 0}
      />
    )
  }

  return (
    <div style={{ height }} className="w-full" data-testid="trend-line">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={MARGIN}
          onClick={(st, e) => {
            if (!onSelect || !data.length) return
            // Ближайший день по X-координате клика: состояние recharts на тапах
            // бывает пустым (холодный тап) или устаревшим (прошлый тап), а
            // координата верна всегда. activeLabel — только запасной путь.
            let d = ''
            const el = e?.currentTarget as Element | undefined
            const rect = el?.getBoundingClientRect?.()
            const x = (e as unknown as { clientX?: number })?.clientX
            if (rect && rect.width > 0 && typeof x === 'number') {
              const plotL = rect.left + MARGIN.left + Y_AXIS_W
              const plotW = rect.width - MARGIN.left - Y_AXIS_W - MARGIN.right
              const n = data.length
              const i = n === 1 || plotW <= 0 ? 0 : Math.round(((x - plotL) / plotW) * (n - 1))
              d = data[Math.min(n - 1, Math.max(0, i))].date
            } else if (typeof st?.activeLabel === 'string') {
              d = st.activeLabel
            }
            if (d) onSelect(d)
          }}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: 10 }}
            tickFormatter={(v: string) => fmtTickDate(v, longRange)}
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
          <Tooltip
            cursor={{ stroke: c.faint, strokeDasharray: '3 3', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as TrendPoint | undefined
              if (!active || !p) return null
              return (
                <div className="glass rounded-xl px-2.5 py-1.5 text-xs shadow-lift">
                  <div className="font-bold text-ink">{p.percent}%</div>
                  <div className="text-faint">{fmtTickDate(p.date, true)}</div>
                </div>
              )
            }}
          />
          <Area
            type="linear"
            dataKey="percent"
            stroke={c.accent}
            strokeWidth={2.5}
            fill="url(#trendFill)"
            isAnimationActive={false}
            dot={renderDot}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
