import { useEffect } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {  DISCOUNT_CODES } from "../discount-codes";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);



// Run all deletions in parallel and wait for them to finish
const results = await Promise.all(
  DISCOUNT_CODES.map(async (code) => {
    const response = await admin.graphql(
      `#graphql 
      mutation discountCodeBulkDelete($search: String) {
        discountCodeBulkDelete(search: $search) {
          job {
            id
            done
          }
          userErrors {
            code
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          search: `${code}`,
        },
      }
    );

    return await response.json();
  })
);

  console.log(results);
  return {
    response: results,
  };
};

export default function Index() {
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
            Delete Discounts
          </s-button>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
