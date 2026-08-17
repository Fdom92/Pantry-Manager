import type { OcrLine, ReceiptRow } from '@core/models/receipt';

/**
 * Rebuild visual rows from OCR lines.
 *
 * ML Kit clusters receipt text by proximity, which on tabular tickets means
 * COLUMNS come out as separate blocks (all names together, all quantities
 * together...). The only reliable way to pair a name with its quantity is
 * geometry: lines whose vertical centers overlap belong to the same row.
 */
export function reconstructRows(lines: OcrLine[]): ReceiptRow[] {
  const withBox = lines.filter(l => l.box && l.text.trim());
  if (!withBox.length) {
    // No geometry available (old fixture / plugin fallback): each line is a row.
    return lines
      .filter(l => l.text.trim())
      .map((l, i) => ({ y: i, cells: [l.text.trim()], text: l.text.trim() }));
  }

  const heights = withBox.map(l => l.box!.bottom - l.box!.top).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 1;
  // Two lines belong to the same row when their centers are closer than ~55%
  // of the median line height. Receipts are printed on a fixed grid, so this
  // tolerates slight skew without merging adjacent rows.
  const tolerance = medianHeight * 0.55;

  const sorted = [...withBox].sort(
    (a, b) => center(a) - center(b),
  );

  const groups: OcrLine[][] = [];
  for (const line of sorted) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(center(line) - groupCenter(last)) <= tolerance) {
      last.push(line);
    } else {
      groups.push([line]);
    }
  }

  return groups.map(group => {
    const cells = [...group]
      .sort((a, b) => a.box!.left - b.box!.left)
      .map(l => l.text.trim());
    return {
      y: groupCenter(group),
      cells,
      text: cells.join(' ').replace(/\s+/g, ' ').trim(),
    };
  });
}

function center(line: OcrLine): number {
  return (line.box!.top + line.box!.bottom) / 2;
}

function groupCenter(group: OcrLine[]): number {
  return group.reduce((sum, l) => sum + center(l), 0) / group.length;
}
