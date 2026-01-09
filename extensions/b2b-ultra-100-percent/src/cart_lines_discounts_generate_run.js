import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

export function cartLinesDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  if (!input.cart.lines.length) {
    throw new Error("No cart lines found");
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(DiscountClass.Order);
  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);
  const productIdsForDiscount = [
    "gid://shopify/ProductVariant/50884916707621", // Ultra Kit 30
    "gid://shopify/ProductVariant/51021320323365", // Ultra Wands 30 / Included,
    "gid://shopify/ProductVariant/51021320356133", // Ultra Wands 30 / Not Included,
    "gid://shopify/ProductVariant/43727059845180", // Test Kit
    "gid://shopify/ProductVariant/43704778752060", // Test Wands
  ];

  if (!hasOrderDiscountClass && !hasProductDiscountClass) {
    return { operations: [] };
  }

  const linesAllegebleForDiscount = input.cart.lines.filter((line) => {
    return productIdsForDiscount.includes(line.merchandise?.id);
  });

  const operations = [];

  let remainingQuantityForWands = 2;
  let remainingQuantityForKits = 1;

  let targetsForDiscount = linesAllegebleForDiscount.map((line) => {
    let currentQuantity = line.quantity;

    if (line.merchandise?.product?.productType === "mira-wands") {
      if (remainingQuantityForWands <= 0) {
        currentQuantity = 0;
      } else if (line.quantity > remainingQuantityForWands) {
        currentQuantity = remainingQuantityForWands;
      } else remainingQuantityForWands -= currentQuantity;
    }

    if (line.merchandise?.product?.productType === "mira-kit") {
      if (remainingQuantityForKits <= 0) {
        currentQuantity = 0;
      } else if (line.quantity > remainingQuantityForKits) {
        currentQuantity = remainingQuantityForKits;
      } else remainingQuantityForKits -= currentQuantity;
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
          value: 100,
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
