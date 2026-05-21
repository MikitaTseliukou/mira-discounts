import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { DISCOUNT_CODES_FOR_UPDATE } from "../discount-codes";

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
  const allBatches = chunkArray(DISCOUNT_CODES_FOR_UPDATE, batchSize);
  const currentBatch = allBatches[batchIndex];

  if (!currentBatch) {
    return {
      done: true,
      total: DISCOUNT_CODES_FOR_UPDATE.length,
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
          // First, look up the discount node ID by code
          const responseForCode = await admin.graphql(
            `#graphql
              query codeDiscountNodeByCode($code: String!) {
                codeDiscountNodeByCode(code: $code) {
                  codeDiscount {
                    __typename
                    ... on DiscountCodeBasic {
                      codesCount {
                        count
                      }
                      shortSummary
                    }
                  }
                  id
                }
              }`,
            {
              variables: {
                code,
              },
            }
          );
          const resultForCode = await responseForCode.json();
          const nodeId = resultForCode.data?.codeDiscountNodeByCode?.id;

          if (!nodeId) {
            console.log(`DISCOUNT CODE NOT FOUND FOR UPDATE: ${code}`);
            return {
              error: true,
              code,
              message: "Discount code not found",
            };
          }

          // Update the discount percentage from 20% to 25%
          const response = await admin.graphql(
            `#graphql
              mutation discountCodeBasicUpdate($id: ID!, $basicCodeDiscount: DiscountCodeBasicInput!) {
                discountCodeBasicUpdate(id: $id, basicCodeDiscount: $basicCodeDiscount) {
                  codeDiscountNode {
                    id
                  }
                  userErrors {
                    field
                    code
                    message
                  }
                }
              }`,
            {
              variables: {
                id: nodeId,
                basicCodeDiscount: {
                  customerGets: {
                    value: {
                      percentage: 0.25,
                    },
                  },
                },
              },
            }
          );
          const result = await response.json();

          if (result?.data?.discountCodeBasicUpdate?.userErrors?.length) {
            console.log(`ERROR Updating DISCOUNT CODE: ${code}`);
            console.log(JSON.stringify(result.data.discountCodeBasicUpdate.userErrors));
          }

          return {
            code,
            result,
          };
        } catch (error) {
          console.log(`ERROR Updating DISCOUNT CODE: ${code}`);
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
    total: DISCOUNT_CODES_FOR_UPDATE.length,
    results,
    successful: results.filter(
      (r) => !r.error && !r.result?.data?.discountCodeBasicUpdate?.userErrors?.length
    ).length,
    failed: results.filter(
      (r) => r.error || r.result?.data?.discountCodeBasicUpdate?.userErrors?.length > 0
    ).length,
  };
};

export default function DiscountsUpdate() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalSuccessful, setTotalSuccessful] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [failedCodes, setFailedCodes] = useState([]);
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

      const batchFailed = data.results.filter(
        (r) => r.error || r.result?.data?.discountCodeBasicUpdate?.userErrors?.length > 0
      );
      if (batchFailed.length > 0) {
        setFailedCodes((prev) => [...prev, ...batchFailed.map((r) => r.code)]);
      }

      // Automatically submit next batch
      const formData = new FormData();
      formData.append("batchIndex", (data.batchIndex + 1).toString());
      fetcher.submit(formData, { method: "POST" });
    } else if (data && data.done) {
      console.log("All batches completed!");
      setIsProcessing(false);
      shopify.toast.show(
        `All discounts updated! Successful: ${totalSuccessful}, Failed: ${totalFailed}`
      );
    }
  }, [data, isProcessing, fetcher]);

  const updateDiscounts = () => {
    setIsProcessing(true);
    setCurrentBatch(0);
    setTotalProcessed(0);
    setTotalSuccessful(0);
    setTotalFailed(0);
    setFailedCodes([]);
    lastProcessedBatch.current = -1;
    const formData = new FormData();
    formData.append("batchIndex", "0");
    fetcher.submit(formData, { method: "POST" });
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  return (
    <s-page heading="Discounts Update">
      <s-section heading="Update Discounts (20% → 25%)">
        <s-stack direction="vertical" gap="base">
          <s-stack direction="inline" gap="base">
            <s-button
              onClick={updateDiscounts}
              {...(isLoading || isProcessing ? { loading: true } : {})}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Update"}
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
                Progress: {Math.min(totalProcessed, DISCOUNT_CODES_FOR_UPDATE.length)} /{" "}
                {DISCOUNT_CODES_FOR_UPDATE.length} discounts processed
              </s-text>
              <s-text>
                Successful: {totalSuccessful} | Failed: {totalFailed}
              </s-text>
            </s-stack>
          )}

          {data && data.done && (
            <s-stack direction="vertical" gap="base">
              <s-text variant="success">
                ✓ Completed! {totalSuccessful} discounts updated successfully, {totalFailed} failed
              </s-text>
              {failedCodes.length > 0 && (
                <s-stack direction="vertical" gap="tight">
                  <s-text tone="critical">Failed codes ({failedCodes.length}):</s-text>
                  <s-text>{failedCodes.join(", ")}</s-text>
                </s-stack>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
