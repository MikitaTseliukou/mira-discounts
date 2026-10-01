import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";

const ELIGIBLE_PRODUCT_TYPE = "mira-wands";
// Matched loosely so "™" / "™️" variations in the title don't break the exclusion
const EXCLUDED_TITLE_FRAGMENT = "cortisol pattern";

// Final discount the customer gets, regardless of purchase type
const TARGET_DISCOUNT = 0.33;

// Loop selling plan discount by delivery interval (in months).
// The line price we receive already includes this discount.
const LOOP_DISCOUNT_BY_INTERVAL = {
  1: 0.1,
  2: 0.05,
};
// Used when the plan interval can't be recognised. 10% is the max Loop discount,
// so assuming it never pushes the final discount above 33%.
const FALLBACK_LOOP_DISCOUNT = 0.1;

const DISCOUNT_MESSAGE = "33% off Mira Wands";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

function isEligibleWand(merchandise) {
  const product = merchandise?.product;
  if (!product) {
    return false;
  }

  return (
    product.productType?.trim().toLowerCase() === ELIGIBLE_PRODUCT_TYPE &&
    !product.title.toLowerCase().includes(EXCLUDED_TITLE_FRAGMENT)
  );
}

function getIntervalInMonths(sellingPlan) {
  const text = `${sellingPlan.name} ${sellingPlan.description ?? ""}`.toLowerCase();
  const match = text.match(/(\d+)\s*-?\s*months?/);
  if (match) {
    return Number(match[1]);
  }
  // "Delivered every month" / "Monthly"
  if (/\bmonth(ly)?\b/.test(text)) {
    return 1;
  }
  return null;
}

function getLoopDiscount(sellingPlanAllocation) {
  if (!sellingPlanAllocation) {
    return 0;
  }

  const interval = getIntervalInMonths(sellingPlanAllocation.sellingPlan);
  return LOOP_DISCOUNT_BY_INTERVAL[interval] ?? FALLBACK_LOOP_DISCOUNT;
}

// Additional % needed on top of the Loop price to reach the target discount:
// (1 - loop) * (1 - additional) = 1 - target
function getAdditionalPercentage(loopDiscount) {
  const additional = 1 - (1 - TARGET_DISCOUNT) / (1 - loopDiscount);
  return Math.round(additional * 10000) / 100;
}

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);

  if (!hasProductDiscountClass) {
    return { operations: [] };
  }

  const candidates = input.cart.lines
    .filter((line) => isEligibleWand(line.merchandise))
    .map((line) => ({
      message: DISCOUNT_MESSAGE,
      targets: [{ cartLine: { id: line.id } }],
      value: {
        percentage: {
          value: getAdditionalPercentage(getLoopDiscount(line.sellingPlanAllocation)),
        },
      },
    }));

  if (!candidates.length) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
