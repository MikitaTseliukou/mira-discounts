import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

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
  const batchSize = 50;
  const csvCodes = formData.get("csvCodes");

  const DISCOUNT_CODES = csvCodes
    ? csvCodes
        .split(/[\n,]/)
        .map((code) => code.trim())
        .filter((code) => code.length > 0)
    : [];

  const allBatches = chunkArray(DISCOUNT_CODES, batchSize);
  const currentBatch = allBatches[batchIndex];

  if (!currentBatch) {
    return { done: true, total: DISCOUNT_CODES.length };
  }

  const MAX_RETRIES = 3;

  async function deleteCode(code) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await delay(500 * attempt);
      try {
        const responseForCode = await admin.graphql(
          `#graphql
            query codeDiscountNodeByCode($code: String!) {
              codeDiscountNodeByCode(code: $code) {
                id
              }
            }`,
          { variables: { code } }
        );
        const resultForCode = await responseForCode.json();
        const codeId = resultForCode.data?.codeDiscountNodeByCode?.id;

        if (!codeId) {
          console.log(`DISCOUNT CODE NOT FOUND FOR DELETION: ${code}`);
          return { error: true, code, message: "Discount code not found" };
        }

        const response = await admin.graphql(
          `#graphql
            mutation ($id: ID!) {
              discountCodeDelete(id: $id) {
                deletedCodeDiscountId
                userErrors { field code message }
              }
            }`,
          { variables: { id: codeId } }
        );
        const result = await response.json();

        if (result?.data?.discountCodeDelete?.userErrors?.length) {
          console.log(`ERROR Deleting DISCOUNT CODE: ${code}`);
          console.log(JSON.stringify(result.data.discountCodeDelete.userErrors));
        }

        return { code, result };
      } catch (error) {
        console.log(`ERROR Deleting DISCOUNT CODE: ${code} (attempt ${attempt + 1}/${MAX_RETRIES})`);
        if (attempt === MAX_RETRIES - 1) {
          return { error: true, code, message: error.message };
        }
      }
    }
  }

  const microBatches = chunkArray(currentBatch, 5);
  const results = [];

  for (let i = 0; i < microBatches.length; i++) {
    const batchResults = await Promise.all(microBatches[i].map(deleteCode));
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
    successful: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
  };
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [totalSuccessful, setTotalSuccessful] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const lastProcessedBatch = useRef(-1);

  const [csvCodes, setCsvCodes] = useState("");
  const [discountCodes, setDiscountCodes] = useState([]);
  const [fileName, setFileName] = useState("");

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) && fetcher.formMethod === "POST";
  const data = fetcher.data;

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
    if (!data || !isProcessing || data.batchIndex === lastProcessedBatch.current) {
      return;
    }

    if (!data.done) {
      console.log(`Batch ${data.batchIndex + 1}/${data.totalBatches} completed`);

      lastProcessedBatch.current = data.batchIndex;
      setTotalProcessed(data.processed);
      setTotalSuccessful((prev) => prev + data.successful);
      setTotalFailed((prev) => prev + data.failed);

      const formData = new FormData();
      formData.append("batchIndex", (data.batchIndex + 1).toString());
      formData.append("csvCodes", csvCodes);
      fetcher.submit(formData, { method: "POST" });
    } else if (data.done) {
      console.log("All batches completed!");
      setIsProcessing(false);
      shopify.toast.show(
        `All discounts deleted! Successful: ${totalSuccessful}, Failed: ${totalFailed}`
      );
    }
  }, [data, isProcessing, fetcher]);

  const deleteDiscounts = () => {
    if (discountCodes.length === 0) {
      shopify.toast.show("Please upload a CSV file with discount codes first", { isError: true });
      return;
    }

    setIsProcessing(true);
    setTotalProcessed(0);
    setTotalSuccessful(0);
    setTotalFailed(0);
    lastProcessedBatch.current = -1;

    const formData = new FormData();
    formData.append("batchIndex", "0");
    formData.append("csvCodes", csvCodes);
    fetcher.submit(formData, { method: "POST" });
  };

  const stopProcessing = () => {
    setIsProcessing(false);
  };

  return (
    <s-page heading="React Router app template">
      <s-section heading="Delete Discounts">
        <s-stack direction="vertical" gap="base">
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

          <s-stack direction="inline" gap="base">
            <s-button
              onClick={deleteDiscounts}
              {...(isLoading || isProcessing ? { loading: true } : {})}
              disabled={isProcessing || discountCodes.length === 0}
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
                Progress: {totalProcessed} / {discountCodes.length} discounts processed
              </s-text>
              <s-text>
                Successful: {totalSuccessful} | Failed: {totalFailed}
              </s-text>
            </s-stack>
          )}

          {data && data.done && (
            <s-text variant="success">
              ✓ Completed! {totalSuccessful} discounts deleted successfully, {totalFailed} failed
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
