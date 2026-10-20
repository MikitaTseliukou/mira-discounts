import { DeliveryDiscountSelectionStrategy, DiscountClass } from "../generated/api";

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  if (!input.cart.deliveryGroups.length) {
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
              targets: input.cart.deliveryGroups.map((group) => ({
                deliveryGroup: {
                  id: group.id,
                },
              })),
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
