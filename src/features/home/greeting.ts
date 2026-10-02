export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 18) return 'Bonjour';
  return 'Bonsoir';
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value).replace(/ | /g, ' ');
}
