import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

export function cartLinesDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  if (!input.cart.lines.length) {
    throw new Error("No cart lines found");
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(DiscountClass.Order);
  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);

  if (!hasOrderDiscountClass && !hasProductDiscountClass) {
    return { operations: [] };
  }

  const linesAllegebleForDiscount = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.inAnyCollection;
  });

  const operations = [];

  let remainingQuantityForWands = 4;

  let targetsForDiscount = linesAllegebleForDiscount.map((line) => {
    let currentQuantity = line.quantity;

    if (line.merchandise?.product?.productType === "mira-wands") {
      if (remainingQuantityForWands <= 0) {
        currentQuantity = 0;
      } else if (line.quantity > remainingQuantityForWands) {
        currentQuantity = remainingQuantityForWands;
      } else remainingQuantityForWands -= currentQuantity;
    }

    return {
      cartLine: {
        id: line.id,
        quantity: currentQuantity,
      },
    };
  });

  let productsDiscountsAdd = {
    productDiscountsAdd: {
      candidates: [],
      selectionStrategy: ProductDiscountSelectionStrategy.All,
    },
  };

  if (hasProductDiscountClass && linesAllegebleForDiscount.length) {
    productsDiscountsAdd.productDiscountsAdd.candidates.push({
      targets: targetsForDiscount,
      value: {
        percentage: {
          value: 35,
        },
      },
    });
  }

  if (productsDiscountsAdd.productDiscountsAdd.candidates.length) {
    operations.push(productsDiscountsAdd);
  }

  console.log(operations.length, "operations");

  return {
    operations,
  };
}
