import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '../theme';

export interface ChartSeries {
  label: string;
  color: string;
}

export interface ChartColumn {
  label: string;
  /** One value per series, in the same order. */
  values: number[];
}

export interface ChartAreaProps {
  series: ChartSeries[];
  columns: ChartColumn[];
  /** Formats the tallest value into the axis caption. */
  formatValue?: (value: number) => string;
  height?: number;
}

/**
 * A small grouped bar chart, drawn with plain views.
 *
 * A charting library would be a large dependency for six columns and at most
 * two bars each. Heights are proportional to the largest value across every
 * column, so the columns stay comparable.
 */
export function ChartArea({
  series,
  columns,
  formatValue = (value) => String(Math.round(value)),
  height = 140,
}: ChartAreaProps) {
  const max = Math.max(
    1,
    ...columns.flatMap((column) => column.values.map((value) => Math.max(0, value))),
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.legend}>
        {series.map((entry) => (
          <View key={entry.label} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: entry.color }]} />
            <Text style={type.caption}>{entry.label}</Text>
          </View>
        ))}
        <Text style={[type.caption, styles.max]}>Peak {formatValue(max)}</Text>
      </View>

      <View style={[styles.plot, { height }]}>
        {columns.map((column) => (
          <View key={column.label} style={styles.column}>
            <View style={styles.bars}>
              {column.values.map((value, index) => (
                <View
                  key={index}
                  style={[
                    styles.bar,
                    {
                      // A visible stub for a real but tiny value; nothing at all
                      // for a genuine zero.
                      height: value <= 0 ? 2 : Math.max(4, (value / max) * (height - 24)),
                      backgroundColor: series[index]?.color ?? colors.border,
                      opacity: value <= 0 ? 0.35 : 1,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={type.caption} numberOfLines={1}>
              {column.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.tight,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.content,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.hair + 2,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  max: {
    marginLeft: 'auto',
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.tight - 2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.hair,
  },
  bars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: 12,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});
