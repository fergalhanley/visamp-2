import { PNG } from "pngjs";

export function pixels(buffer) {
  return PNG.sync.read(buffer).data;
}

export function variance(values) {
  let sum = 0;
  let squared = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 4) {
    const luminance = values[i] * 0.2126 + values[i + 1] * 0.7152 + values[i + 2] * 0.0722;
    sum += luminance;
    squared += luminance * luminance;
    count += 1;
  }
  const mean = sum / count;
  return squared / count - mean * mean;
}

export function difference(left, right) {
  if (left.length !== right.length) throw new Error("frame sizes differ");
  let total = 0;
  for (let i = 0; i < left.length; i += 4) {
    total += Math.abs(left[i] - right[i]);
    total += Math.abs(left[i + 1] - right[i + 1]);
    total += Math.abs(left[i + 2] - right[i + 2]);
  }
  return total / ((left.length / 4) * 3);
}

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
