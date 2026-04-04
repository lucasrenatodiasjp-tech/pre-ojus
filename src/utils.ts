export function formatCompactNumber(value: number): string {
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  
  if (absValue >= 1_000_000_000) {
    return (value / 1_000_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' bi';
  }
  if (absValue >= 1_000_000) {
    return (value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  }
  return value.toLocaleString('pt-BR');
}

export function parseCompactNumber(input: string): number {
  if (!input) return 0;
  
  let cleanInput = input.toLowerCase().trim();
  
  // Detect suffixes
  const isBillion = cleanInput.endsWith('bi') || cleanInput.endsWith('b');
  const isMillion = cleanInput.endsWith('mi') || cleanInput.endsWith('m');
  
  let multiplier = 1;
  if (isBillion) {
    multiplier = 1_000_000_000;
    cleanInput = cleanInput.replace(/bi$|b$/, '').trim();
  } else if (isMillion) {
    multiplier = 1_000_000;
    cleanInput = cleanInput.replace(/mi$|m$/, '').trim();
  }

  // Handle separators
  if (cleanInput.includes(',') && cleanInput.includes('.')) {
    // Both exist: dot is thousands, comma is decimal
    cleanInput = cleanInput.replace(/\./g, '').replace(',', '.');
  } else if (cleanInput.includes(',')) {
    // Only comma: it's the decimal separator
    cleanInput = cleanInput.replace(',', '.');
  } else if (cleanInput.includes('.')) {
    // Only dot:
    // If it's a compact number (has multiplier), it's likely a decimal (e.g. 1.78 bi)
    // If it has multiple dots, they are thousands (e.g. 1.200.000)
    const dotCount = (cleanInput.match(/\./g) || []).length;
    if (dotCount > 1) {
      cleanInput = cleanInput.replace(/\./g, '');
    } else if (!isBillion && !isMillion) {
      // Single dot in a non-compact number is ambiguous.
      // In pt-BR "1.200" is usually 1200.
      const parts = cleanInput.split('.');
      if (parts[1].length === 3) {
        cleanInput = cleanInput.replace('.', '');
      }
    }
  }
  
  const value = parseFloat(cleanInput);
  if (isNaN(value)) return 0;
  
  return value * multiplier;
}

export function getScaleAndValue(totalValue: number): { value: number, scale: number } {
  if (totalValue === 0) return { value: 0, scale: 1 };
  const absValue = Math.abs(totalValue);
  
  if (absValue >= 1_000_000_000) {
    return { value: totalValue / 1_000_000_000, scale: 1_000_000_000 };
  }
  if (absValue >= 1_000_000) {
    return { value: totalValue / 1_000_000, scale: 1_000_000 };
  }
  return { value: totalValue, scale: 1 };
}
