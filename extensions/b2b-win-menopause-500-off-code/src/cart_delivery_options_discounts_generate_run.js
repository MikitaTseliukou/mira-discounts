import { DeliveryDiscountSelectionStrategy, DiscountClass } from "../generated/api";

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    return { operations: [] };
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
