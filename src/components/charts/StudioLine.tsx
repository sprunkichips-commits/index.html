import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore } from '@/store/StoreContext'
import { useChartColors } from '@/lib/useChartColors'
import { fmtCompact, rub } from '@/lib/format'
import type { BarPoint } from './BarStat'

// Геометрия — нужна и разметке, и выбору точки по координате клика.
const MARGIN = { top: 14, right: 8, left: 0, bottom: 0 }
const Y_AXIS_W = 48

/**
 * Линейный график статистики «как в YouTube Studio»: строго прямые отрезки,
 * градиентная заливка, тап/клик выбирает период. Альтернатива BarStat —
 * переключается в Settings → Chart style.
 */
export function StudioLine({
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
  // Подписи как в BarStat: мало точек — все, много (дни месяца) — кратные 5.
  const many = data.length > 16
  const ticks = many ? data.map((d) => d.label).filter((l) => Number(l) % 5 === 0) : undefined

  const renderDot = (props: { cx?: number; cy?: number; index?: number }) => {
    const { cx, cy, index } = props
    const sel = index === selected
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={sel ? 5 : many ? 0 : 2.5}
        fill={c.accent}
        stroke={sel ? c.bg : 'none'}
        strokeWidth={sel ? 2 : 0}
      />
    )
  }

  return (
    <div style={{ height }} className="w-full" data-testid="studio-line">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={MARGIN}
          onClick={(st, e) => {
            if (!data.length) return
            // Индекс по X-координате клика: состояние recharts на тапах бывает
            // пустым или устаревшим, координата верна всегда (см. TrendLine).
            const el = e?.currentTarget as Element | undefined
            const rect = el?.getBoundingClientRect?.()
            const x = (e as unknown as { clientX?: number })?.clientX
            if (rect && rect.width > 0 && typeof x === 'number') {
              const plotL = rect.left + MARGIN.left + Y_AXIS_W
              const plotW = rect.width - MARGIN.left - Y_AXIS_W - MARGIN.right
              const n = data.length
              const i = n === 1 || plotW <= 0 ? 0 : Math.round(((x - plotL) / plotW) * (n - 1))
              onSelect(Math.min(n - 1, Math.max(0, i)))
            } else if (typeof st?.activeTooltipIndex === 'number') {
              onSelect(st.activeTooltipIndex)
            }
          }}
        >
          <defs>
            <linearGradient id="studioFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.accent} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: c.faint, fontSize: many ? 10 : 9.5 }}
            interval={many ? undefined : 0}
            ticks={ticks}
            minTickGap={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={Y_AXIS_W}
            tickMargin={6}
            tick={{ fill: c.faint, fontSize: 10 }}
            tickFormatter={(v) => fmtCompact(v as number)}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: c.faint, strokeDasharray: '3 3', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as BarPoint | undefined
              if (!active || !p) return null
              return (
                <div className="glass rounded-xl px-2.5 py-1.5 text-xs shadow-lift">
                  <div className="mono font-bold text-ink">{rub(p.value)}</div>
                  <div className="text-faint">{p.label}</div>
                </div>
              )
            }}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke={c.accent}
            strokeWidth={2.5}
            fill="url(#studioFill)"
            isAnimationActive={false}
            dot={renderDot}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
