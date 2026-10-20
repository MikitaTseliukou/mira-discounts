import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

// Discount value in the shop's default currency (USD).
const DISCOUNT_AMOUNT = 259;

export function cartLinesDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  const linesEligibleForDiscount = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.inAnyCollection;
  });

  if (!linesEligibleForDiscount.length) {
    return { operations: [] };
  }

  const targets = linesEligibleForDiscount.map((line) => ({
    cartLine: {
      id: line.id,
      quantity: line.quantity,
    },
  }));

  // Fixed amounts are applied in the cart's currency, so convert for non-USD markets.
  const amount = (DISCOUNT_AMOUNT * parseFloat(input.presentmentCurrencyRate || "1")).toFixed(2);

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              targets,
              value: {
                // appliesToEachItem defaults to false: $259 is spread once across all targets.
                fixedAmount: {
                  amount,
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
