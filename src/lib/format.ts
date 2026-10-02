/** French enumeration: "a", "a et b", "a, b et c". */
export function frenchList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}
