import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';


export function cartLinesDiscountsGenerateRun(input) {
  console.log(JSON.stringify(input));
  if (!input.cart.lines.length) {
    throw new Error('No cart lines found');
  }

  const hasOrderDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Order,
  );
  const hasProductDiscountClass = input.discount.discountClasses.includes(
    DiscountClass.Product,
  );


  if (!hasOrderDiscountClass && !hasProductDiscountClass) {
    return {operations: []};
  }


  const miraWandsCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === 'mira-wands';
  });

  const miraKitCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === 'mira-kit';
  });

  const miraEcosystemCartlines = input.cart.lines.filter((line) => {
    return line.merchandise?.product?.productType === 'mira-ecosystem';
  });

  const miraWandsCartQuantity = input.cart.lines.reduce((acc, line) => {
     if (line.merchandise?.product?.productType === 'mira-wands') {
      acc += line.quantity;
     }

     return acc;
  }, 0);

  const operations = [];  

  let targets = miraWandsCartlines.map((line) => ({
    cartLine: {
      id: line.id,
    },
  }));

  if (miraKitCartlines.length) {
    targets.push({
      cartLine: {
        id: miraKitCartlines[0].id,
        quantity: 1
      },
    });
  }

    // operations.push({
    //   productDiscountsAdd: {
    //     candidates: [
    //       {
    //         targets: [
    //           ...miraKitCartlines.map((line) => ({
    //             cartLine: {
    //               id: line.id,
    //             },
    //           })),
    //           ...miraWandsCartlines.map((line) => ({
    //             cartLine: {
    //               id: line.id,
    //             },
    //           })),
    //         ],
    //         value: {
    //           percentage: {
    //             value: 30,
    //           },
    //         },
    //       },
    //     ],
    //     selectionStrategy: ProductDiscountSelectionStrategy.First,
    //   },
    // });

      let productsDiscountsAdd = {
        productDiscountsAdd: {
          candidates: [],
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      };

    if (hasProductDiscountClass && (miraWandsCartQuantity >= 3 || (miraWandsCartQuantity >= 2 && miraKitCartlines.length))) {
      productsDiscountsAdd.productDiscountsAdd.candidates.push(
         {
            targets: targets,
            value: {
              percentage: {
                value: 45,
              },
            },
          });

          if (miraKitCartlines[0]?.quantity > 1) {
            productsDiscountsAdd.productDiscountsAdd.candidates.push(
              {
                targets: [
                 {
                    cartLine: {
                      id: miraKitCartlines[0].id,
                      quantity: miraKitCartlines[0].quantity - 1,
                    },
                  }
                ],
                value: {
                  percentage: {
                    value: 30,
                  },
                },
              }
            );
          }

          if (miraKitCartlines.length > 1) {
            productsDiscountsAdd.productDiscountsAdd.candidates.push(
              {
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
              }
            );
          }
    } else if (miraKitCartlines.length || miraWandsCartlines.length) {
          productsDiscountsAdd.productDiscountsAdd.candidates.push(
              {
                targets: [
                  ...miraKitCartlines.map((line) => ({
                    cartLine: {
                      id: line.id,
                    },
                  })),
                  ...miraWandsCartlines.map((line) => ({
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
              }
            );
    }

    if (miraEcosystemCartlines.length) {
      productsDiscountsAdd.productDiscountsAdd.candidates.push(
          {
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
          }
        );
    }


  // if (hasProductDiscountClass && (miraWandsCartQuantity >= 3 || (miraWandsCartQuantity >= 2 && miraKitCartlines.length))) {
  //   operations.push({
  //     productDiscountsAdd: {
  //       candidates: [
  //             {
  //           targets: [
  //             ...miraKitCartlines.map((line) => ({
  //               cartLine: {
  //                 id: line.id,
  //               },
  //             })),
  //             ...miraWandsCartlines.map((line) => ({
  //               cartLine: {
  //                 id: line.id,
  //               },
  //             })),
  //           ],
  //           value: {
  //             percentage: {
  //               value: 30,
  //             },
  //           },
  //         },
  //         {
  //           targets: targets,
  //           value: {
  //             percentage: {
  //               value: 45,
  //             },
  //           },
  //         }
  //       ],
  //       selectionStrategy: ProductDiscountSelectionStrategy.All,
  //     },
  //   });
  // }

  if (productsDiscountsAdd.productDiscountsAdd.candidates.length) {
    operations.push(productsDiscountsAdd);
  }

    console.log(operations.length, 'operations');

  return {
    operations,
  };
}