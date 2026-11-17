// Liste → ayrıntı geçişinde satırı yeniden indirmemek için küçük bellek içi taşıyıcı.
const store = new Map<string, unknown>();

export function remember<T>(kind: string, id: string, value: T) {
  store.set(`${kind}:${id}`, value);
}

export function recall<T>(kind: string, id: string): T | undefined {
  return store.get(`${kind}:${id}`) as T | undefined;
}
