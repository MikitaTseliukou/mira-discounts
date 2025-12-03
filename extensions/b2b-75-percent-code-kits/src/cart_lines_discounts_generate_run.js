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
    return line.merchandise?.product?.productType === "mira-kit";
  });

  const operations = [];

  let remainingQuantityForKits = 1;

  let targetsForDiscount = linesAllegebleForDiscount.slice(0, 1).map((line) => {
    let currentQuantity = line.quantity;

    if (remainingQuantityForKits <= 0) {
      currentQuantity = 0;
    } else if (line.quantity > remainingQuantityForKits) {
      currentQuantity = remainingQuantityForKits;
    } else {
      remainingQuantityForKits -= currentQuantity;
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
          value: 75,
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
