import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";
const ELIGIBLE_VARIANT_IDS = [
  // test store variants
  "gid://shopify/ProductVariant/43501168721980",
  "gid://shopify/ProductVariant/43704778752060",
  // live store variants
  // Basic Kit
  "gid://shopify/ProductVariant/45088435634469",
  // Mira Hormone Monitor: Max Kit
  "gid://shopify/ProductVariant/45163642192165",
  "gid://shopify/ProductVariant/45163642224933",
  // Ultra4 Kit
  "gid://shopify/ProductVariant/50884916674853",
  "gid://shopify/ProductVariant/50884916707621",
  // 20 Max Test Wands
  "gid://shopify/ProductVariant/47027188793637",
  "gid://shopify/ProductVariant/47027188826405",
  // Mira Ovum Wands
  "gid://shopify/ProductVariant/45163653693733",
  "gid://shopify/ProductVariant/47026861375781",
  "gid://shopify/ProductVariant/45163653726501",
  "gid://shopify/ProductVariant/47026861408549",
  // Mira Ultra4 Wands
  "gid://shopify/ProductVariant/50524484534565",
  "gid://shopify/ProductVariant/50524484567333",
  "gid://shopify/ProductVariant/51021320323365",
  "gid://shopify/ProductVariant/51021320356133",
  // Mira Panorama Fertility Lab Test
  "gid://shopify/ProductVariant/47698470142245",
];

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
    return ELIGIBLE_VARIANT_IDS.includes(line.merchandise?.id);
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

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              targets,
              value: {
                fixedAmount: {
                  amount: "500.00",
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
