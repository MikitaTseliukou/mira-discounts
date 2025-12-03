import { useEffect, useRef, useState } from "react";
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const batchIndex = parseInt(formData.get("batchIndex") || "0");
  const batchSize = 50; // Process 50 codes per request

  // Get the current batch
  const allBatches = chunkArray(DISCOUNT_CODES, batchSize);
  const currentBatch = allBatches[batchIndex];

  if (!currentBatch) {
    return {
      done: true,
      total: DISCOUNT_CODES.length,
    };
  }

  // Process current batch in smaller chunks to avoid rate limits
  const microBatches = chunkArray(currentBatch, 5);
  const results = [];

  for (let i = 0; i < microBatches.length; i++) {
    const microBatch = microBatches[i];

    const batchResults = await Promise.all(
      microBatch.map(async (code) => {
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
          console.log(JSON.stringify(error));
          return {
            error: true,
            code,
            message: error.message,
          };
        }
      })
    );

    results.push(...batchResults);

    if (i < microBatches.length - 1) {
      await delay(200);
    }
  }

  return {
    done: false,
    batchIndex,
    totalBatches: allBatches.length,
    processed: (batchIndex + 1) * batchSize,
    total: DISCOUNT_CODES.length,
    results,
    successful: results.filter(
      (r) => !r.error && !r.result?.data?.discountCodeAppCreate?.userErrors?.length
    ).length,
    failed: results.filter(
      (r) => r.error || r.result?.data?.discountCodeAppCreate?.userErrors?.length > 0
    ).length,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalSuccessful, setTotalSuccessful] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedBatch = useRef(-1);

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const data = fetcher.data;

  useEffect(() => {
    if (!data || !isProcessing || data.batchIndex === lastProcessedBatch.current) {
      return;
    }

    if (!data.done) {
      console.log(`Batch ${data.batchIndex + 1}/${data.totalBatches} completed`);

      lastProcessedBatch.current = data.batchIndex;

      setTotalProcessed(data.processed);
      setCurrentBatch(data.batchIndex + 1);
      setTotalSuccessful((prev) => prev + data.successful);
      setTotalFailed((prev) => prev + data.failed);

      // Automatically submit next batch
      const formData = new FormData();
      formData.append("batchIndex", (data.batchIndex + 1).toString());
      fetcher.submit(formData, { method: "POST" });
    } else if (data && data.done) {
      console.log("All batches completed!");
      setIsProcessing(false);
      shopify.toast.show(
        `All discounts deleted! Successful: ${totalSuccessful}, Failed: ${totalFailed}`
      );
    }
  }, [data, isProcessing, fetcher]);

  const deleteDiscounts = () => {
    setIsProcessing(true);
    setCurrentBatch(0);
    setTotalProcessed(0);
    const formData = new FormData();
    formData.append("batchIndex", "0");
    fetcher.submit(formData, { method: "POST" });
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  return (
    <s-page heading="React Router app template">
      <s-section heading="Delete Discounts">
        <s-stack direction="vertical" gap="base">
          <s-stack direction="inline" gap="base">
            <s-button
              onClick={deleteDiscounts}
              {...(isLoading || isProcessing ? { loading: true } : {})}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Delete Discounts"}
            </s-button>
            {isProcessing && (
              <s-button onClick={stopProcessing} variant="secondary">
                Stop
              </s-button>
            )}
          </s-stack>
          {isProcessing && (
            <s-stack direction="vertical" gap="tight">
              <s-text>
                Progress: {totalProcessed} / {DISCOUNT_CODES.length} discounts processed
              </s-text>
              <s-text>
                Successful: {totalSuccessful} | Failed: {totalFailed}
              </s-text>
            </s-stack>
          )}
          {data && data.done && (
            <s-text variant="success">
              ✓ All {DISCOUNT_CODES.length} discounts deleted successfully!
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
