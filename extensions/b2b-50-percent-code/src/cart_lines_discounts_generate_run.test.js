import { describe, it, expect } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { DiscountClass } from "../generated/api";

function buildInput({
  discountClasses = [DiscountClass.Product],
  subtotal = "199.0",
  lines = [],
  presentmentCurrencyRate = "1.0",
} = {}) {
  return {
    cart: { cost: { subtotalAmount: { amount: subtotal } }, lines },
    discount: { discountClasses },
    presentmentCurrencyRate,
  };
}

function line({ id = "gid://shopify/CartLine/kit", productType = "mira-kit" } = {}) {
  return {
    id,
    merchandise: {
      id: "gid://shopify/ProductVariant/1",
      product: { productType },
    },
  };
}

function targetIds(result) {
  return result.operations[0].productDiscountsAdd.candidates[0].targets.map(
    (target) => target.cartLine.id
  );
}

describe("cartLinesDiscountsGenerateRun", () => {
  it("returns no operations for an empty cart", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput());
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations when the product discount class is missing", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ discountClasses: [DiscountClass.Order], lines: [line()] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("returns no operations without kits", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ productType: "mira-wands" })] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("applies 50% to kits", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ lines: [line()] }));
    const candidate = result.operations[0].productDiscountsAdd.candidates[0];
    expect(candidate.value.percentage.value).toBe(50);
    expect(targetIds(result)).toEqual(["gid://shopify/CartLine/kit"]);
  });

  it("applies when the order subtotal is exactly $320", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ subtotal: "320.0", lines: [line()] }));
    expect(result.operations).toHaveLength(1);
  });

  it("returns no operations when the order subtotal is over $320", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ subtotal: "320.01", lines: [line()] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("converts the limit to the cart currency (e.g. CAD at 1.4)", () => {
    // 320 USD * 1.4 = 448 CAD
    const applies = cartLinesDiscountsGenerateRun(
      buildInput({ subtotal: "448.0", presentmentCurrencyRate: "1.4", lines: [line()] })
    );
    expect(applies.operations).toHaveLength(1);

    const over = cartLinesDiscountsGenerateRun(
      buildInput({ subtotal: "448.01", presentmentCurrencyRate: "1.4", lines: [line()] })
    );
    expect(over.operations).toHaveLength(0);
  });

  it("uses a lower limit for stronger currencies (e.g. GBP at 0.8)", () => {
    // 320 USD * 0.8 = 256 GBP
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ subtotal: "300.0", presentmentCurrencyRate: "0.8", lines: [line()] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("discounts only the kit lines", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        lines: [
          line({ id: "gid://shopify/CartLine/kit-1" }),
          line({ id: "gid://shopify/CartLine/wands", productType: "mira-wands" }),
          line({ id: "gid://shopify/CartLine/kit-2" }),
        ],
      })
    );
    expect(targetIds(result)).toEqual(["gid://shopify/CartLine/kit-1", "gid://shopify/CartLine/kit-2"]);
  });
});
