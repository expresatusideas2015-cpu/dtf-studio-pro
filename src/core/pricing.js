import { PRICING_CONSTANTS } from '../config/pricingRules.js';

/**
 * Calcula el precio basado EXCLUSIVAMENTE en la altura usada.
 * @param {number} usedHeightCm - Altura real utilizada en cm
 * @returns {number} Precio calculado redondeado hacia abajo
 */
export function computePrice(usedHeightCm) {
  const { TIER_1, TIER_2, TIER_3 } = PRICING_CONSTANTS;

  // 1) 0 a 50 cm: Proporcional hacia abajo (Regla de 3 simple con base 50cm = $15.000)
  if (usedHeightCm <= TIER_1.height) {
    const ratio = usedHeightCm / TIER_1.height;
    return Math.floor(ratio * TIER_1.price);
  }

  // 2) 50 a 100 cm: Lineal entre $15.000 y $22.000
  if (usedHeightCm <= TIER_2.height) {
    const range = TIER_2.height - TIER_1.height;
    const priceRange = TIER_2.price - TIER_1.price;
    const extraCm = usedHeightCm - TIER_1.height;
    const extraPrice = (extraCm / range) * priceRange;
    return Math.floor(TIER_1.price + extraPrice);
  }

  // 3) 100 a 200 cm: Lineal entre $22.000 y $44.000
  if (usedHeightCm <= TIER_3.height) {
    const range = TIER_3.height - TIER_2.height;
    const priceRange = TIER_3.price - TIER_2.price;
    const extraCm = usedHeightCm - TIER_2.height;
    const extraPrice = (extraCm / range) * priceRange;
    return Math.floor(TIER_2.price + extraPrice);
  }

  // 4) Tope máximo (aunque el canvas limita a 200cm, seguridad extra)
  return TIER_3.price;
}