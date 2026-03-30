export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTelegramLink(url: string, label: unknown): string {
  return `<a href="${escapeTelegramHtml(url)}">${escapeTelegramHtml(label)}</a>`;
}
