import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

const ELIGIBLE_PRODUCT_TYPE = "mira-kit";
const DISCOUNT_PERCENTAGE = 50;
// The code only works on orders whose subtotal (before discounts) is up to this amount
const MAX_ORDER_SUBTOTAL = 300;

const DISCOUNT_MESSAGE = "50%";

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

  if (Number(input.cart.cost.subtotalAmount.amount) > MAX_ORDER_SUBTOTAL) {
    return { operations: [] };
  }

  const targets = input.cart.lines
    .filter((line) => line.merchandise?.product?.productType === ELIGIBLE_PRODUCT_TYPE)
    .map((line) => ({ cartLine: { id: line.id } }));

  if (!targets.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: DISCOUNT_MESSAGE,
              targets,
              value: {
                percentage: {
                  value: DISCOUNT_PERCENTAGE,
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
