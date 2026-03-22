export const ALLOWED_SHARED_MAPPING_CARD_TYPES = new Set(['ONE', 'LADY', 'PPV', 'SOLITAIRE']);

export function normalizeSharedMappingCardType(cardType) {
  return typeof cardType === 'string' ? cardType.trim().toUpperCase() : cardType;
}

export function isAllowedSharedMappingCardType(cardType) {
  return ALLOWED_SHARED_MAPPING_CARD_TYPES.has(normalizeSharedMappingCardType(cardType));
}
