import { describe, it, expect } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { DiscountClass } from "../generated/api";

const MAX_WANDS_VARIANT_ID = "gid://shopify/ProductVariant/00000000000001";
const OVUM_WANDS_VARIANT_ID = "gid://shopify/ProductVariant/00000000000003";

function buildInput({
  countryCode = "GB",
  discountClasses = [DiscountClass.Product],
  lines = [],
} = {}) {
  return {
    cart: { lines },
    localization: { country: { isoCode: countryCode } },
    discount: { discountClasses },
  };
}

function maxWandsLine(amount = "30.00") {
  return {
    id: "gid://shopify/CartLine/max-wands",
    quantity: 1,
    cost: { subtotalAmount: { amount } },
    merchandise: { id: MAX_WANDS_VARIANT_ID },
  };
}

function ovumWandsLine(amount = "30.00") {
  return {
    id: "gid://shopify/CartLine/ovum-wands",
    quantity: 1,
    cost: { subtotalAmount: { amount } },
    merchandise: { id: OVUM_WANDS_VARIANT_ID },
  };
}

describe("cartLinesDiscountsGenerateRun", () => {
  it("returns no operations for an empty cart", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ lines: [] }));
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations when the product discount class is missing", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        discountClasses: [],
        lines: [maxWandsLine(), ovumWandsLine()],
      })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations outside the UK market", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        countryCode: "US",
        lines: [maxWandsLine(), ovumWandsLine()],
      })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations without a Max Wands line", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ lines: [ovumWandsLine()] }));
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations without an Ovum Wands line in the cart", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ lines: [maxWandsLine("70.00")] }));
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations when the cart subtotal is under $60", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [maxWandsLine("20.00"), ovumWandsLine("20.00")] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("makes the Ovum Wands line free when all conditions are met", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [maxWandsLine("40.00"), ovumWandsLine("20.00")] })
    );

    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      productDiscountsAdd: {
        candidates: [
          {
            message: "Your free box of Ovum Wands",
            targets: [
              {
                cartLine: {
                  id: "gid://shopify/CartLine/ovum-wands",
                  quantity: 1,
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
        selectionStrategy: "ALL",
      },
    });
  });
});
