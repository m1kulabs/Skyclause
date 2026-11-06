export function pseudo(text: string): string {
  const length = Array.from(text).length
  return `${text}${'~'.repeat(Math.ceil(length * 0.3))}`
}
