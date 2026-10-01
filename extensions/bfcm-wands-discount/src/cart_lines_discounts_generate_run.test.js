import { describe, it, expect } from "vitest";

import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import { DiscountClass } from "../generated/api";

function buildInput({ discountClasses = [DiscountClass.Product], lines = [] } = {}) {
  return {
    cart: { lines },
    discount: { discountClasses },
  };
}

function line({
  id = "gid://shopify/CartLine/wand",
  productType = "mira-wands",
  title = "Mira Fertility Max Wands",
  sellingPlanName = null,
} = {}) {
  return {
    id,
    merchandise: {
      id: "gid://shopify/ProductVariant/1",
      product: { productType, title },
    },
    sellingPlanAllocation: sellingPlanName
      ? {
          sellingPlan: {
            id: "gid://shopify/SellingPlan/1",
            name: sellingPlanName,
            description: null,
          },
        }
      : null,
  };
}

function percentages(result) {
  return result.operations[0].productDiscountsAdd.candidates.map((candidate) => ({
    id: candidate.targets[0].cartLine.id,
    value: candidate.value.percentage.value,
  }));
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

  it("returns no operations without eligible wands", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ productType: "mira-analyzer" })] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("excludes Mira Cortisol Pattern Wands", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ title: "Mira Cortisol Pattern™️ Wands" })] })
    );
    expect(result.operations).toHaveLength(0);
  });

  it("applies 33% to a one-time wand order", () => {
    const result = cartLinesDiscountsGenerateRun(buildInput({ lines: [line()] }));
    expect(result.operations[0].productDiscountsAdd.selectionStrategy).toBe("ALL");
    expect(percentages(result)).toEqual([{ id: "gid://shopify/CartLine/wand", value: 33 }]);
  });

  it("applies 29.47% on top of the 5% Loop discount for every-2-months plans", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ sellingPlanName: "Deliver every 2 months" })] })
    );
    expect(percentages(result)[0].value).toBe(29.47);
  });

  it("applies 25.56% on top of the 10% Loop discount for every-month plans", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ sellingPlanName: "Deliver every month" })] })
    );
    expect(percentages(result)[0].value).toBe(25.56);
  });

  it("treats 'monthly' plans as every 1 month", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ sellingPlanName: "Monthly subscription" })] })
    );
    expect(percentages(result)[0].value).toBe(25.56);
  });

  it("assumes the max 10% Loop discount for unrecognised plans", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({ lines: [line({ sellingPlanName: "Subscribe & save" })] })
    );
    expect(percentages(result)[0].value).toBe(25.56);
  });

  it("discounts each eligible line separately and skips the rest", () => {
    const result = cartLinesDiscountsGenerateRun(
      buildInput({
        lines: [
          line({ id: "gid://shopify/CartLine/one-time" }),
          line({ id: "gid://shopify/CartLine/sub", sellingPlanName: "Deliver every 2 months" }),
          line({ id: "gid://shopify/CartLine/cortisol", title: "Mira Cortisol Pattern™ Wands" }),
          line({ id: "gid://shopify/CartLine/analyzer", productType: "mira-analyzer" }),
        ],
      })
    );
    expect(percentages(result)).toEqual([
      { id: "gid://shopify/CartLine/one-time", value: 33 },
      { id: "gid://shopify/CartLine/sub", value: 29.47 },
    ]);
  });
});
