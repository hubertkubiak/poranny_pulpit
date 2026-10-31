// Turns a list of values into SVG polyline points that fill a width x height box.
// Deliberately duplicated in mfe-weather: remotes share no code of their own (see README, exercises).
export function toPoints(values: number[], width: number, height: number, padding = 4): string {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, i) => {
      const x = i * step;
      const y = padding + ((range - (value - min)) / range) * (height - 2 * padding);
      return `${round(x)},${round(y)}`;
    })
    .join(' ');
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
