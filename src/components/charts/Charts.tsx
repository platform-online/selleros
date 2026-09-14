/**
 * Chart wrappers.
 * Every chart shares one tooltip, one legend, one colour ramp and one
 * empty/loading state. Dense series scroll horizontally on narrow screens
 * instead of rendering unreadably small.
 */
import { useState, type ReactNode } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '../ui/primitives';
import { IconChart } from '../ui/icons';
import { formatMoney, formatNumber, formatPercent, type Language } from '../../lib/format';
import { toMajor, type Money } from '../../lib/money';

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

export interface Series {
  key: string;
  name: string;
  /** how to format values for this series */
  format: 'money' | 'number' | 'percent' | 'multiple';
  color?: string;
  type?: 'area' | 'line' | 'bar';
  axis?: 'left' | 'right';
}

export interface ChartPoint {
  label: string;
  [key: string]: string | number | null;
}

interface TooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  lang,
  currency,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  series: Series[];
  lang: Language;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((entry, i) => {
        const s = series.find((x) => x.key === entry.dataKey);
        const raw = typeof entry.value === 'number' ? entry.value : Number(entry.value ?? 0);
        return (
          <div className="chart-tooltip__row" key={`${entry.dataKey}-${i}`}>
            <span>
              <span className="chart-tooltip__swatch" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span>{formatChartValue(raw, s?.format ?? 'number', lang, currency)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function formatChartValue(
  value: number,
  format: Series['format'],
  lang: Language,
  currency: string,
): string {
  switch (format) {
    case 'money':
      return formatMoney(Math.round(value) as Money, { currency, lang });
    case 'percent':
      return formatPercent(value, lang, 1);
    case 'multiple':
      return `${formatNumber(value, lang, 2)}×`;
    case 'number':
    default:
      return formatNumber(value, lang, Math.abs(value) < 10 && !Number.isInteger(value) ? 2 : 0);
  }
}

function InteractiveLegend({
  series,
  hidden,
  onToggle,
}: {
  series: Series[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (series.length < 2) return null;
  return (
    <div className="chart-legend">
      {series.map((s, i) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={!hidden.has(s.key)}
          onClick={() => onToggle(s.key)}
        >
          <span
            className="chart-tooltip__swatch"
            style={{ background: s.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
          />
          {s.name}
        </button>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
  series,
  height = 280,
  lang,
  currency,
  emptyLabel,
  emptyBody,
  denseScroll = true,
  stacked,
}: {
  data: ChartPoint[];
  series: Series[];
  height?: number;
  lang: Language;
  currency: string;
  emptyLabel: string;
  emptyBody: string;
  denseScroll?: boolean;
  stacked?: boolean;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = data.some((d) => series.some((s) => Number(d[s.key] ?? 0) !== 0));

  if (data.length === 0 || !hasData) {
    return <EmptyState icon={<IconChart size={20} />} title={emptyLabel} body={emptyBody} />;
  }

  const scroll = denseScroll && data.length > 14;
  const chart = (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--chart-grid)' }}
          minTickGap={18}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
          tickLine={false}
          axisLine={false}
          width={54}
          tickFormatter={(v: number) => formatMoney(Math.round(v) as Money, { currency, lang, compact: true })}
        />
        {series.some((s) => s.axis === 'right') && (
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => formatNumber(v, lang, 0)}
          />
        )}
        <Tooltip
          content={<ChartTooltip series={series} lang={lang} currency={currency} />}
          cursor={{ stroke: 'var(--ink-200)', strokeWidth: 1 }}
        />
        {visible.map((s, i) => {
          const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length];
          if (s.type === 'bar') {
            return (
              <Bar
                key={s.key}
                yAxisId={s.axis ?? 'left'}
                dataKey={s.key}
                name={s.name}
                fill={color}
                radius={[3, 3, 0, 0]}
                stackId={stacked ? 'stack' : undefined}
                maxBarSize={38}
              />
            );
          }
          if (s.type === 'line') {
            return (
              <Line
                key={s.key}
                yAxisId={s.axis ?? 'left'}
                dataKey={s.key}
                name={s.name}
                stroke={color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3.5 }}
                type="monotone"
              />
            );
          }
          return (
            <Area
              key={s.key}
              yAxisId={s.axis ?? 'left'}
              dataKey={s.key}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              fill={color}
              fillOpacity={0.08}
              stackId={stacked ? 'stack' : undefined}
              type="monotone"
              activeDot={{ r: 3.5 }}
            />
          );
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );

  return (
    <div className="chart">
      <InteractiveLegend series={series} hidden={hidden} onToggle={toggle} />
      <div className="chart__wrap">
        {scroll ? <div className="chart__scroll">{chart}</div> : chart}
      </div>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  lang,
  currency,
  format = 'money',
  height,
  color = 'var(--chart-1)',
  negativeColor = 'var(--chart-4)',
  onSelect,
}: {
  data: { label: string; value: number; id?: string }[];
  lang: Language;
  currency: string;
  format?: Series['format'];
  height?: number;
  color?: string;
  negativeColor?: string;
  onSelect?: (id: string) => void;
}) {
  if (data.length === 0) {
    return <EmptyState icon={<IconChart size={20} />} title="No data" body="Nothing to compare yet." />;
  }
  const h = height ?? Math.max(180, data.length * 34);
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: 'var(--chart-axis)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => formatChartValue(v, format, lang, currency)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={128}
            tick={{ fontSize: 11, fill: 'var(--ink-600)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            content={<ChartTooltip series={[{ key: 'value', name: 'Value', format }]} lang={lang} currency={currency} />}
            cursor={{ fill: 'var(--surface-3)' }}
          />
          <Bar
            dataKey="value"
            radius={[0, 3, 3, 0]}
            maxBarSize={20}
            onClick={(entry: { id?: string }) => {
              if (onSelect && entry?.id) onSelect(entry.id);
            }}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.value < 0 ? negativeColor : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({
  data,
  lang,
  currency,
  format = 'money',
  centerLabel,
  centerValue,
  height = 240,
}: {
  data: { label: string; value: number }[];
  lang: Language;
  currency: string;
  format?: Series['format'];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  if (total <= 0) {
    return <EmptyState icon={<IconChart size={20} />} title="No data" body="Nothing to break down yet." />;
  }
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={1.5}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={<ChartTooltip series={[{ key: 'value', name: 'Value', format }]} lang={lang} currency={currency} />}
          />
          <Legend
            verticalAlign="bottom"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => <span style={{ fontSize: 11, color: 'var(--ink-600)' }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="center muted tiny" style={{ marginTop: -8 }}>
          {centerLabel}: <strong>{centerValue}</strong>
        </div>
      )}
    </div>
  );
}

/** Funnel visual with per-step conversion and drop-off (spec §63). */
export function FunnelChart({
  steps,
  lang,
  currency,
}: {
  steps: { key: string; label: string; value: number; conversionPct: number | null; costPerUnit: number | null; dropOffPct: number | null }[];
  lang: Language;
  currency: string;
}) {
  if (steps.length === 0) {
    return <EmptyState icon={<IconChart size={20} />} title="No funnel data" body="Add ad data to see the funnel." />;
  }
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      {steps.map((s, i) => {
        const widthPct = Math.max(6, (s.value / max) * 100);
        const color = CHART_COLORS[Math.min(i, CHART_COLORS.length - 1)];
        return (
          <div key={s.key}>
            <div className="row--between row" style={{ marginBottom: 4 }}>
              <span className="small strong">{s.label}</span>
              <span className="num small">
                {formatNumber(s.value, lang, 0)}
                {s.conversionPct !== null && (
                  <span className="muted tiny"> · {formatPercent(s.conversionPct, lang, 2)}</span>
                )}
                {s.costPerUnit !== null && (
                  <span className="muted tiny">
                    {' '}
                    · {formatMoney(Math.round(s.costPerUnit * 100) as Money, { currency, lang })}
                  </span>
                )}
              </span>
            </div>
            <div className="bar" style={{ height: 22, borderRadius: 'var(--radius-sm)' }}>
              <div
                style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: color,
                  opacity: 0.85,
                  borderRadius: 'var(--radius-sm)',
                  transition: 'width var(--duration-slow) var(--ease-out)',
                }}
              />
            </div>
            {s.dropOffPct !== null && s.dropOffPct > 0 && i > 0 && (
              <div className="tiny muted" style={{ marginTop: 2 }}>
                − {formatPercent(s.dropOffPct, lang, 1)} drop-off
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Tiny inline sparkline for metric tiles. */
export function Sparkline({ values, color = 'var(--chart-1)', width = 92, height = 26 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <span style={{ display: 'inline-block', width, height }} />;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 4) - 2}`)
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Money → major units for chart series. */
export const toChartMoney = (minor: Money): number => Number(toMajor(minor).toFixed(2));

export function ChartEmpty({ title, body }: { title: ReactNode; body: ReactNode }) {
  return <EmptyState icon={<IconChart size={20} />} title={title} body={body} />;
}
