import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

const BATCH_SIZE = 50; // Process 50 codes per request

// Parse a single-column CSV with a "Code" header into a list of unique codes.
// Shopify codes are case-insensitive, so duplicates are detected ignoring case.
// Trailing notes in parentheses, e.g. "MORGAN30 (Panorama $30 off)", are stripped.
function parseCodesCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0].replace(/^"|"$/g, "").trim());

  if (lines[0]?.toLowerCase() === "code") {
    lines.shift();
  }

  const seen = new Set();
  const codes = [];
  for (const line of lines) {
    const code = line.replace(/\s*\(.*\)\s*$/, "").trim();
    if (!code || seen.has(code.toUpperCase())) continue;
    seen.add(code.toUpperCase());
    codes.push(code);
  }
  return codes;
}

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
  const total = parseInt(formData.get("total") || "0");
  const currentBatch = JSON.parse(formData.get("codes") || "[]");
  const percent = Number(formData.get("percent"));

  if (!Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return {
      done: true,
      total,
      invalidPercent: true,
    };
  }

  if (!currentBatch.length) {
    return {
      done: true,
      total,
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

          // Update the discount percentage to the value entered in the form
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
                      percentage: percent / 100,
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
    totalBatches: Math.ceil(total / BATCH_SIZE),
    processed: Math.min((batchIndex + 1) * BATCH_SIZE, total),
    total,
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
  const [codes, setCodes] = useState([]);
  const [fileName, setFileName] = useState("");
  const [percent, setPercent] = useState("");
  const percentValue = Number(percent);
  const isPercentValid =
    percent !== "" && Number.isFinite(percentValue) && percentValue > 0 && percentValue <= 100;
  const lastProcessedBatch = useRef(-1);

  const submitBatch = (batchIndex) => {
    const batchCodes = codes.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    const formData = new FormData();
    formData.append("batchIndex", batchIndex.toString());
    formData.append("total", codes.length.toString());
    formData.append("codes", JSON.stringify(batchCodes));
    formData.append("percent", percent);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const parsedCodes = parseCodesCsv(await file.text());
    setFileName(file.name);
    setCodes(parsedCodes);
    shopify.toast.show(`Loaded ${parsedCodes.length} codes from ${file.name}`);
  };

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
      submitBatch(data.batchIndex + 1);
    } else if (data.invalidPercent) {
      setIsProcessing(false);
      shopify.toast.show("Invalid percentage. Enter a value between 0 and 100.", {
        isError: true,
      });
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
    submitBatch(0);
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  return (
    <s-page heading="Discounts Update">
      <s-section heading="Update Discount Percentage">
        <s-stack direction="vertical" gap="base">
          <s-stack direction="vertical" gap="tight">
            <s-text>Upload a CSV file with a single &quot;Code&quot; column:</s-text>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={isProcessing}
            />
            {fileName && (
              <s-text>
                {fileName}: {codes.length} unique codes
              </s-text>
            )}
          </s-stack>
          <s-stack direction="vertical" gap="tight">
            <s-text>New discount percentage (%):</s-text>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              placeholder="e.g. 29"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              disabled={isProcessing}
            />
          </s-stack>
          <s-stack direction="inline" gap="base">
            <s-button
              onClick={updateDiscounts}
              {...(isLoading || isProcessing ? { loading: true } : {})}
              disabled={isProcessing || !codes.length || !isPercentValid}
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
                Progress: {Math.min(totalProcessed, codes.length)} / {codes.length} discounts
                processed
              </s-text>
              <s-text>
                Successful: {totalSuccessful} | Failed: {totalFailed}
              </s-text>
            </s-stack>
          )}

          {data && data.done && !data.invalidPercent && (
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
