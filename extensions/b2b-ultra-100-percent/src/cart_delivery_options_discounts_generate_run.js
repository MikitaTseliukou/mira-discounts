import { DeliveryDiscountSelectionStrategy, DiscountClass } from "../generated/api";

/**
 * @typedef {import("../generated/api").DeliveryInput} RunInput
 * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
 */

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  console.log("cart delivery input", JSON.stringify(input));
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    throw new Error("No delivery groups found");
  }

  const hasShippingDiscountClass = input.discount.discountClasses.includes(DiscountClass.Shipping);

  if (!hasShippingDiscountClass) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message: "FREE SHIPPING",
              targets: [
                {
                  deliveryGroup: {
                    id: firstDeliveryGroup.id,
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
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
