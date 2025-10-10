import {
  DeliveryDiscountSelectionStrategy,
  DiscountClass,
} from "../generated/api";

/**
  * @typedef {import("../generated/api").DeliveryInput} RunInput
  * @typedef {import("../generated/api").CartDeliveryOptionsDiscountsGenerateRunResult} CartDeliveryOptionsDiscountsGenerateRunResult
  */

/**
  * @param {RunInput} input
  * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
  */

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    throw new Error("No delivery groups found");
  }

  const hasShippingDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Shipping,
  );

  if (!hasShippingDiscountClass) {
    return {operations: []};
  }

  const miraKitCartline = input.cart.lines.find((line) => {
    return line.merchandise?.product?.productType === 'mira-kit';
  });

  const miraWandsCartQuantity = input.cart.lines.reduce((acc, line) => {
     if (line.merchandise?.product?.productType === 'mira-wands') {
      acc += line.quantity;
     }

     return acc;
  }, 0);


  if ((miraWandsCartQuantity >= 3 || (miraWandsCartQuantity >= 2 && miraKitCartline))) {
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

  return {operations: []};
}