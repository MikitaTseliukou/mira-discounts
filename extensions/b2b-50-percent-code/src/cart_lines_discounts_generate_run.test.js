import { describe, it, expect } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { DiscountClass } from "../generated/api";

function buildInput({ discountClasses = [DiscountClass.Product], subtotal = "199.0", lines = [] } = {}) {
  return {
    cart: { cost: { subtotalAmount: { amount: subtotal } }, lines },
    discount: { discountClasses },
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

  it("applies when the order subtotal is exactly $300", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ subtotal: "300.0", lines: [line()] }));
    expect(result.operations).toHaveLength(1);
  });

  it("returns no operations when the order subtotal is over $300", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ subtotal: "300.01", lines: [line()] })
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
