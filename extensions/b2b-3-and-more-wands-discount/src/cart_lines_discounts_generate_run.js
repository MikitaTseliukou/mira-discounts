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

  const miraWandsCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === "mira-wands";
  });

  const miraKitCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === "mira-kit";
  });

  const miraEcosystemCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === "mira-ecosystem";
  });

  const miraWandsCartQuantity = input.cart.lines.reduce((acc, line) => {
    if (line.merchandise?.product?.productType === "mira-wands") {
      acc += line.quantity;
    }

    return acc;
  }, 0);

  console.log(miraWandsCartlines, "miraWandsCartlines");

  const operations = [];

  let remainingQuantity = 4;

  let targetsForHigherDiscount = miraWandsCartlines.map((line) => {
    let currentQuantity = line.quantity;

    if (remainingQuantity <= 0) {
      currentQuantity = 0;
    } else if (line.quantity > remainingQuantity) {
      currentQuantity = remainingQuantity;
    } else remainingQuantity -= currentQuantity;

    return {
      cartLine: {
        id: line.id,
        quantity: currentQuantity,
      },
    };
  });

  if (miraKitCartlines.length) {
    targetsForHigherDiscount.push({
      cartLine: {
        id: miraKitCartlines[0].id,
        quantity: 1,
      },
    });
  }

  let productsDiscountsAdd = {
    productDiscountsAdd: {
      candidates: [],
      selectionStrategy: ProductDiscountSelectionStrategy.All,
    },
  };

  if (
    hasProductDiscountClass &&
    (miraWandsCartQuantity >= 3 || (miraWandsCartQuantity >= 2 && miraKitCartlines.length))
  ) {
    productsDiscountsAdd.productDiscountsAdd.candidates.push({
      targets: targetsForHigherDiscount,
      value: {
        percentage: {
          value: 45,
        },
      },
    });

    if (miraKitCartlines[0]?.quantity > 1) {
      productsDiscountsAdd.productDiscountsAdd.candidates.push({
        targets: [
          {
            cartLine: {
              id: miraKitCartlines[0].id,
              quantity: miraKitCartlines[0].quantity - 1,
            },
          },
        ],
        value: {
          percentage: {
            value: 30,
          },
        },
      });
    }

    if (miraKitCartlines.length > 1) {
      productsDiscountsAdd.productDiscountsAdd.candidates.push({
        targets: [
          ...miraKitCartlines.slice(1).map((line) => ({
            cartLine: {
              id: line.id,
            },
          })),
        ],
        value: {
          percentage: {
            value: 30,
          },
        },
      });
    }
  } else if (miraKitCartlines.length || miraWandsCartlines.length) {
    remainingQuantity = 4;

    productsDiscountsAdd.productDiscountsAdd.candidates.push({
      targets: [
        ...miraKitCartlines.map((line) => ({
          cartLine: {
            id: line.id,
          },
        })),
        ...miraWandsCartlines.map((line) => {
          let currentQuantity = line.quantity;

          if (remainingQuantity <= 0) {
            currentQuantity = 0;
          } else if (line.quantity > remainingQuantity) {
            currentQuantity = remainingQuantity;
          } else remainingQuantity -= currentQuantity;

          return {
            cartLine: {
              id: line.id,
            },
          };
        }),
      ],
      value: {
        percentage: {
          value: 30,
        },
      },
    });
  }

  if (miraEcosystemCartlines.length) {
    productsDiscountsAdd.productDiscountsAdd.candidates.push({
      targets: [
        ...miraEcosystemCartlines.map((line) => ({
          cartLine: {
            id: line.id,
          },
        })),
      ],
      value: {
        percentage: {
          value: 30,
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
