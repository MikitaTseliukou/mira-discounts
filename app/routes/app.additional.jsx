import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { DISCOUNT_CODES } from "../discount-codes";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);



// Run all deletions in parallel and wait for them to finish
const results = await Promise.all(
  DISCOUNT_CODES.map(async (code) => {
    const response2 = await admin.graphql(
    `
    #graphql
  mutation discountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
      codeAppDiscount {
        discountId
        title
        appDiscountType {
          description
          functionId
        }
        combinesWith {
          orderDiscounts
          productDiscounts
          shippingDiscounts
        }
        codes(first: 5) {
          nodes {
            code
          }
        }
        status
        usageLimit
      }
      userErrors {
        field
        message
      }
    }
  }`,{
  variables: {
    codeAppDiscount: {
      title: `B2B discount, 3+ wands (${code})`,
      functionHandle: "b2b-3-and-more-wands-discount",
      discountClasses: ["PRODUCT", "ORDER", "SHIPPING"],
      startsAt: "2025-01-01T00:00:00",
      combinesWith: {
        shippingDiscounts:true
      },
      code
    }
  }
}
  );

  

  return await response2.json()

  })
);

  console.log(results);
  return {
    response: results,
  };
};

export default function AdditionalPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const data = fetcher.data;


  useEffect(() => {
    console.log(data)
  }, [data, shopify]);
  const generateProduct = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="React Router app template">

      <s-section heading="Get started with products">
        
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={generateProduct}
            {...(isLoading ? { loading: true } : {})}
          >
            Generate Discounts
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
