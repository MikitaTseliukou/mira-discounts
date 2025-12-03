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

// Helper function to chunk array into smaller batches
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Helper function to delay execution
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Split codes into batches of 10 (adjust based on your rate limit)
  const batches = chunkArray(DISCOUNT_CODES, 10);
  const allResults = [];

  // Process each batch sequentially with a delay between batches
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // Process codes in current batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (code) => {
        try {
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
            }`,
            {
              variables: {
                search: `${code}`,
              },
            }
          );

          return {
            code,
            result: await response.json(),
          };
        } catch (error) {
          return {
            error: true,
            code,
            message: error.message,
          };
        }
      })
    );

    allResults.push(...batchResults);

    // Add delay between batches (500ms = 0.5 seconds)
    // Adjust this based on your needs and Shopify's rate limits
    if (i < batches.length - 1) {
      await delay(600);
    }

    // Log progress
    console.log(
      `Processed batch ${i + 1}/${batches.length} (${allResults.length}/${DISCOUNT_CODES.length} codes)`
    );
  }

  return {
    response: allResults,
    total: DISCOUNT_CODES.length,
    successful: allResults.filter((r) => !r.error).length,
    failed: allResults.filter((r) => r.error).length,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const data = fetcher.data;

  useEffect(() => {
    if (data) {
      console.log(`Total: ${data.total}, Successful: ${data.successful}, Failed: ${data.failed}`);
      console.log(data);
    }
  }, [data, shopify]);

  const deleteDiscounts = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="React Router app template">
      <s-section heading="Get started with products">
        <s-stack direction="inline" gap="base">
          <s-button onClick={deleteDiscounts} {...(isLoading ? { loading: true } : {})}>
            Delete Discounts
          </s-button>
          {data && (
            <s-text>
              Completed: {data.successful}/{data.total} discounts deleted
              {data.failed > 0 && `, ${data.failed} failed`}
            </s-text>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
