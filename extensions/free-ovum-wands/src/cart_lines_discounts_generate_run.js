import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

// TODO: replace with the real Max Wands variant IDs
const MAX_WANDS_VARIANT_IDS = [
  "gid://shopify/ProductVariant/47027188793637",
  "gid://shopify/ProductVariant/47027188826405",
];

// TODO: replace with the real Ovum Wands variant IDs
const OVUM_WANDS_VARIANT_IDS = [
  "gid://shopify/ProductVariant/51080530231589",
  "gid://shopify/ProductVariant/51080530264357",
  "gid://shopify/ProductVariant/51080530297125",
  "gid://shopify/ProductVariant/51080530329893",
];

const MIN_CART_SUBTOTAL = 60;
const ELIGIBLE_COUNTRY_CODE = "GB";
const FREE_GIFT_MESSAGE = "Your free box of Ovum Wands";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  if (input.localization.country.isoCode !== ELIGIBLE_COUNTRY_CODE) {
    return { operations: [] };
  }

  const hasMaxWands = input.cart.lines.some((line) =>
    MAX_WANDS_VARIANT_IDS.includes(line.merchandise?.id)
  );

  const ovumWandsLine = input.cart.lines.find((line) =>
    OVUM_WANDS_VARIANT_IDS.includes(line.merchandise?.id)
  );

  console.log(hasMaxWands, ovumWandsLine, "includes");

  if (!hasMaxWands || !ovumWandsLine) {
    return { operations: [] };
  }

  const cartSubtotal = input.cart.lines.reduce(
    (total, line) => total + Number(line.cost.subtotalAmount.amount),
    0
  );

  if (cartSubtotal < MIN_CART_SUBTOTAL) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: FREE_GIFT_MESSAGE,
              targets: [
                {
                  cartLine: {
                    id: ovumWandsLine.id,
                    quantity: 1,
                  },
                },
              ],
              value: {
                percentage: {
                  value: 100,
                },
              },
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
