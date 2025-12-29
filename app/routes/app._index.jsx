import { useEffect, useState, useRef } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

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

  // Parse configuration from formData
  const csvCodes = formData.get("csvCodes");
  const appliesOncePerCustomer = formData.get("appliesOncePerCustomer") === "true";
  const hasUsageLimit = formData.get("hasUsageLimit") === "true";
  const usageLimit = hasUsageLimit ? parseInt(formData.get("usageLimit") || "1") : null;
  const purchaseType = formData.get("purchaseType") || "BOTH";
  const functionHandle = formData.get("functionHandle") || "b2b-75-percent-code-wands";
  const combineProductDiscounts = formData.get("combineProductDiscounts") === "true";
  const combineOrderDiscounts = formData.get("combineOrderDiscounts") === "true";
  const combineShippingDiscounts = formData.get("combineShippingDiscounts") === "true";

  // Parse CSV codes (newline or comma separated)
  const DISCOUNT_CODES = csvCodes
    ? csvCodes
        .split(/[\n,]/)
        .map((code) => code.trim())
        .filter((code) => code.length > 0)
    : [];

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
            }`,
            {
              variables: {
                codeAppDiscount: {
                  title: code,
                  functionHandle,
                  discountClasses: ["PRODUCT", "ORDER", "SHIPPING"],
                  startsAt: "2025-01-01T00:00:00",
                  appliesOncePerCustomer,
                  combinesWith: {
                    productDiscounts: combineProductDiscounts,
                    orderDiscounts: combineOrderDiscounts,
                    shippingDiscounts: combineShippingDiscounts,
                  },
                  ...(hasUsageLimit && { usageLimit }),
                  ...(purchaseType === "SUBSCRIPTION" && { appliesOnSubscription: true }),
                  ...(purchaseType === "ONE_TIME" && { appliesOnOneTimePurchase: true }),
                  ...(purchaseType === "BOTH" && {
                    appliesOnSubscription: true,
                    appliesOnOneTimePurchase: true,
                  }),
                  code,
                },
              },
            }
          );
          const result = await response.json();
          let error = null;
          if (result?.data?.discountCodeAppCreate?.userErrors?.length) {
            console.log(`ERROR CREATING DISCOUNT CODE: ${code}`);
            console.log(JSON.stringify(result.data.discountCodeAppCreate.userErrors));
            error = result.data.discountCodeAppCreate.userErrors
              .reduce((acc, curr) => {
                return acc + curr.message + " ";
              }, "")
              .trim();
          }

          return {
            code,
            result,
            error,
          };
        } catch (error) {
          console.log(`ERROR CREATING DISCOUNT CODE: ${code}`);
          console.log(JSON.stringify(error));

          return {
            error: error.message,
            code,
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
    errors: results.filter((r) => r.error),
  };
};

export default function AdditionalPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalSuccessful, setTotalSuccessful] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [errorMessages, setErrorMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedBatch = useRef(-1);

  // Form state
  const [csvCodes, setCsvCodes] = useState("");
  const [appliesOncePerCustomer, setAppliesOncePerCustomer] = useState(true);
  const [hasUsageLimit, setHasUsageLimit] = useState(false);
  const [usageLimit, setUsageLimit] = useState(1);
  const [purchaseType, setPurchaseType] = useState("BOTH");
  const [discountCodes, setDiscountCodes] = useState([]);
  const [fileName, setFileName] = useState("");
  const [functionHandle, setFunctionHandle] = useState("b2b-75-percent-code-wands");
  const [combineProductDiscounts, setCombineProductDiscounts] = useState(false);
  const [combineOrderDiscounts, setCombineOrderDiscounts] = useState(false);
  const [combineShippingDiscounts, setCombineShippingDiscounts] = useState(false);

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const data = fetcher.data;

  // Handle CSV file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      setCsvCodes(text);
      const codes = text
        .split(/[\n,]/)
        .map((code) => code.trim())
        .filter((code) => code.length > 0);
      setDiscountCodes(codes);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    // Prevent processing the same batch twice
    if (!data || !isProcessing || data.batchIndex === lastProcessedBatch.current) {
      return;
    }

    if (!data.done) {
      console.log(`Batch ${data.batchIndex + 1}/${data.totalBatches} completed`);

      lastProcessedBatch.current = data.batchIndex;
      setTotalProcessed(data.processed);
      setTotalSuccessful((prev) => prev + data.successful);
      setTotalFailed((prev) => prev + data.failed);
      setErrorMessages((prev) => [
        ...prev,
        ...data.errors.map((r) => `${r.code} - Error: ${r.error}`),
      ]);
      setCurrentBatch(data.batchIndex + 1);

      // Automatically submit next batch
      const formData = new FormData();
      formData.append("batchIndex", (data.batchIndex + 1).toString());
      formData.append("csvCodes", csvCodes);
      formData.append("appliesOncePerCustomer", appliesOncePerCustomer.toString());
      formData.append("hasUsageLimit", hasUsageLimit.toString());
      formData.append("usageLimit", usageLimit.toString());
      formData.append("purchaseType", purchaseType);
      formData.append("functionHandle", functionHandle);
      formData.append("combineProductDiscounts", combineProductDiscounts.toString());
      formData.append("combineOrderDiscounts", combineOrderDiscounts.toString());
      formData.append("combineShippingDiscounts", combineShippingDiscounts.toString());
      fetcher.submit(formData, { method: "POST" });
    } else if (data.done) {
      console.log("All batches completed!");
      setIsProcessing(false);
      shopify.toast.show(
        `All discounts created! Successful: ${totalSuccessful}, Failed: ${totalFailed}`
      );
    }
  }, [data, isProcessing, fetcher]); // Only depend on data and isProcessing

  const generateDiscounts = () => {
    if (discountCodes.length === 0) {
      shopify.toast.show("Please add discount codes first", { isError: true });
      return;
    }

    setIsProcessing(true);
    setCurrentBatch(0);
    setTotalProcessed(0);
    setTotalSuccessful(0);
    setTotalFailed(0);
    lastProcessedBatch.current = -1;
    const formData = new FormData();
    formData.append("batchIndex", "0");
    formData.append("csvCodes", csvCodes);
    formData.append("appliesOncePerCustomer", appliesOncePerCustomer.toString());
    formData.append("hasUsageLimit", hasUsageLimit.toString());
    formData.append("usageLimit", usageLimit.toString());
    formData.append("purchaseType", purchaseType);
    formData.append("functionHandle", functionHandle);
    formData.append("combineProductDiscounts", combineProductDiscounts.toString());
    formData.append("combineOrderDiscounts", combineOrderDiscounts.toString());
    formData.append("combineShippingDiscounts", combineShippingDiscounts.toString());
    fetcher.submit(formData, { method: "POST" });
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  return (
    <s-page heading="React Router app template">
      <s-section heading="Generate Discounts">
        <s-stack direction="vertical" gap="base">
          {/* Discount Function Selector */}
          <s-stack direction="vertical" gap="tight">
            <s-text variant="headingMd">Discount Function</s-text>
            <select
              value={functionHandle}
              onChange={(e) => setFunctionHandle(e.target.value)}
              style={{
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
              disabled={isProcessing}
            >
              <option value="b2b-75-percent-code-wands">B2B 75% - Wands</option>
              <option value="b2b-75-percent-code-kits">B2B 75% - Kits</option>
              <option value="b2b-70-percent-code">B2B 70% - Healthcare Expert’s Choice</option>
              <option value="b2b-3-and-more-wands-discount">B2B 3+ Wands Discount</option>
              <option value="b2b-35-percent-code">B2B 35% - Healthcare Expert’s Choice</option>
            </select>
          </s-stack>

          {/* CSV Upload */}
          <s-stack direction="vertical" gap="tight">
            <s-text variant="headingMd">Discount Codes</s-text>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              disabled={isProcessing}
              style={{
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
            />
            {fileName && <s-text variant="bodySm">Loaded: {fileName}</s-text>}
            <s-text variant="bodySm">
              {discountCodes.length} code{discountCodes.length !== 1 ? "s" : ""} ready to process
            </s-text>
          </s-stack>

          {/* Purchase Type Selector */}
          <s-stack direction="vertical" gap="tight">
            <s-text variant="headingMd">Purchase Type</s-text>
            <select
              value={purchaseType}
              onChange={(e) => setPurchaseType(e.target.value)}
              style={{
                padding: "8px",
                border: "1px solid #ccc",
                borderRadius: "4px",
              }}
              disabled={isProcessing}
            >
              <option value="BOTH">Both (Subscription & One-time)</option>
              <option value="SUBSCRIPTION">Subscription only</option>
              <option value="ONE_TIME">One-time purchase only</option>
            </select>
          </s-stack>

          {/* Applies Once Per Customer Checkbox */}
          <s-stack direction="inline" gap="tight">
            <input
              type="checkbox"
              id="appliesOncePerCustomer"
              checked={appliesOncePerCustomer}
              onChange={(e) => setAppliesOncePerCustomer(e.target.checked)}
              disabled={isProcessing}
            />
            <label htmlFor="appliesOncePerCustomer">
              <s-text>Applies once per customer</s-text>
            </label>
          </s-stack>

          {/* Discount Combinations */}
          <s-stack direction="vertical" gap="tight">
            <s-text variant="headingMd">Combinations</s-text>
            <s-text variant="bodySm">This discount can be combined with:</s-text>
            <s-stack direction="vertical" gap="tight">
              <s-stack direction="inline" gap="tight">
                <input
                  type="checkbox"
                  id="combineProductDiscounts"
                  checked={combineProductDiscounts}
                  onChange={(e) => setCombineProductDiscounts(e.target.checked)}
                  disabled={isProcessing}
                />
                <label htmlFor="combineProductDiscounts">
                  <s-text>Product discounts</s-text>
                </label>
              </s-stack>
              <s-stack direction="inline" gap="tight">
                <input
                  type="checkbox"
                  id="combineOrderDiscounts"
                  checked={combineOrderDiscounts}
                  onChange={(e) => setCombineOrderDiscounts(e.target.checked)}
                  disabled={isProcessing}
                />
                <label htmlFor="combineOrderDiscounts">
                  <s-text>Order discounts</s-text>
                </label>
              </s-stack>
              <s-stack direction="inline" gap="tight">
                <input
                  type="checkbox"
                  id="combineShippingDiscounts"
                  checked={combineShippingDiscounts}
                  onChange={(e) => setCombineShippingDiscounts(e.target.checked)}
                  disabled={isProcessing}
                />
                <label htmlFor="combineShippingDiscounts">
                  <s-text>Shipping discounts</s-text>
                </label>
              </s-stack>
            </s-stack>
          </s-stack>

          {/* Usage Limit Checkbox and Input */}
          <s-stack direction="vertical" gap="tight">
            <s-stack direction="inline" gap="tight">
              <input
                type="checkbox"
                id="hasUsageLimit"
                checked={hasUsageLimit}
                onChange={(e) => setHasUsageLimit(e.target.checked)}
                disabled={isProcessing}
              />
              <label htmlFor="hasUsageLimit">
                <s-text>Set usage limit</s-text>
              </label>
            </s-stack>
            {hasUsageLimit && (
              <input
                type="number"
                min="1"
                value={usageLimit}
                onChange={(e) => setUsageLimit(parseInt(e.target.value) || 1)}
                style={{
                  width: "150px",
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
                disabled={isProcessing}
              />
            )}
          </s-stack>

          <s-stack direction="inline" gap="base">
            <s-button
              onClick={generateDiscounts}
              {...(isLoading || isProcessing ? { loading: true } : {})}
              disabled={isProcessing || discountCodes.length === 0}
            >
              {isProcessing ? "Processing..." : "Generate Discounts"}
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
                Progress: {totalProcessed} / {discountCodes.length} discounts processed
              </s-text>
              <s-text>
                Successful: {totalSuccessful} | Failed: {totalFailed}
              </s-text>
            </s-stack>
          )}
          {data && data.done && (
            <>
              <s-text variant="success">
                ✓ Completed! {totalSuccessful} discounts created successfully,
                {` ${totalFailed} failed`}
              </s-text>
              {errorMessages.length > 0 && (
                <s-stack direction="vertical" gap="tight">
                  <s-text variant="headingMd">Errors:</s-text>
                  {errorMessages.map((msg, index) => (
                    <s-text key={index} variant="bodySm" tone="critical">
                      {msg}
                    </s-text>
                  ))}
                </s-stack>
              )}
            </>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
