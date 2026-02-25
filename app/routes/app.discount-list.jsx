import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const functionId = formData.get("functionId");
  const allDiscounts = [];
  let hasNextPage = true;
  let cursor = null;

  try {
    while (hasNextPage) {
      const query = `#graphql
        query($cursor: String) {
          discountNodes(first: 250, after: $cursor) {
            edges {
              node {
                id
                discount {
                  ... on DiscountCodeApp {
                    title
                    codes(first: 10) {
                      nodes {
                        code
                      }
                    }
                    discountClasses
                    status
                    appliesOncePerCustomer
                    usageLimit
                    asyncUsageCount
                    createdAt
                    startsAt
                    endsAt
                    combinesWith {
                      orderDiscounts
                      productDiscounts
                      shippingDiscounts
                    }
                    discountId
                    appDiscountType {
                      functionId
                    }
                  }
                }
              }
              cursor
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const response = await admin.graphql(query, {
        variables: { cursor },
      });
      const result = await response.json();

      if (result?.data?.discountNodes) {
        const nodes = result.data.discountNodes.edges
          .map((edge) => edge.node)
          .filter((node) => {
            const nodeFunctionId = node.discount?.appDiscountType?.functionId;
            return nodeFunctionId && nodeFunctionId === functionId;
          });

        allDiscounts.push(...nodes);

        hasNextPage = result.data.discountNodes.pageInfo.hasNextPage;
        if (hasNextPage) {
          const edges = result.data.discountNodes.edges;
          cursor = edges[edges.length - 1]?.cursor;
        }
      } else {
        hasNextPage = false;
      }
    }

    return {
      discounts: allDiscounts,
      total: allDiscounts.length,
    };
  } catch (error) {
    console.error("Error fetching discounts:", error);
    return {
      error: error.message,
      discounts: [],
    };
  }
};

export default function AdditionalPage() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [selectedFunctionForList, setSelectedFunctionForList] = useState(
    "019ae4f9-3d0d-7a80-885b-203667e331c3"
  );
  const [fetchedDiscounts, setFetchedDiscounts] = useState([]);
  const [isLoadingDiscounts, setIsLoadingDiscounts] = useState(false);

  const data = fetcher.data;

  useEffect(() => {
    if (!data) return;

    setIsLoadingDiscounts(false);
    if (data.error) {
      shopify.toast.show(data.error, { isError: true });
    } else {
      setFetchedDiscounts(data.discounts || []);
      shopify.toast.show(`Loaded ${data.total} discount codes`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleShowDiscounts = () => {
    setIsLoadingDiscounts(true);
    setFetchedDiscounts([]);
    const formData = new FormData();
    formData.append("functionId", selectedFunctionForList);
    fetcher.submit(formData, { method: "POST" });
  };

  const downloadCSV = () => {
    const headers = ["Code", "Title", "Status", "Usage", "Limit", "Once Per Customer", "Created"];
    const rows = fetchedDiscounts.map((discount) => {
      const discountData = discount.discount;
      const code = discountData?.codes?.nodes?.[0]?.code || "N/A";
      return [
        code,
        discountData?.title || "N/A",
        discountData?.status || "N/A",
        discountData?.asyncUsageCount || 0,
        discountData?.usageLimit || "Unlimited",
        discountData?.appliesOncePerCustomer ? "Yes" : "No",
        discountData?.createdAt ? new Date(discountData.createdAt).toLocaleDateString() : "N/A",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `discount-codes-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <s-page heading="Discount Management">
      {/* View Discount Codes Section */}
      <s-section heading="View Discount Codes">
        <s-stack direction="vertical" gap="base">
          <s-stack direction="horizontal" gap="base" style={{ alignItems: "flex-end" }}>
            <s-stack direction="vertical" gap="tight" style={{ flex: 1 }}>
              <s-text variant="headingMd">Discount Function</s-text>
              <select
                value={selectedFunctionForList}
                onChange={(e) => setSelectedFunctionForList(e.target.value)}
                style={{
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                  width: "100%",
                }}
                disabled={isLoadingDiscounts}
              >
                <option value="019ae4f9-3d0d-7a80-885b-203667e331c3">B2B 75% - Wands</option>
                <option value="019ae4e9-b027-722f-8435-a460319e4765">B2B 75% - Kits</option>
                <option value="019ae06d-4e02-7351-93f0-7a676175ea48">
                  B2B 70% - Healthcare Expert&apos;s Choice
                </option>
                <option value="07e9f7e4-67ee-498e-b0c2-a3bbbdef6ce2">B2B 3+ Wands Discount</option>
                <option value="019b458f-74fd-7526-961e-129ca4e26d58">
                  B2B 35% - Healthcare Expert&apos;s Choice
                </option>
                <option value="019ba2ce-78a2-7211-a3e6-fb0622e60f35">
                  B2B 1 Ultra Kit (30) & 2 Ultra Wands (30) 100% Discount
                </option>
              </select>
            </s-stack>
            <s-button
              onClick={handleShowDiscounts}
              {...(isLoadingDiscounts ? { loading: true } : {})}
              disabled={isLoadingDiscounts}
            >
              Show
            </s-button>
          </s-stack>

          {/* Display Table */}
          {fetchedDiscounts.length > 0 && (
            <s-stack direction="vertical" gap="tight">
              <s-text variant="headingMd">
                Found {fetchedDiscounts.length} discount code
                {fetchedDiscounts.length !== 1 ? "s" : ""}
              </s-text>
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  maxHeight: "500px",
                  overflowY: "auto",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                  }}
                >
                  <thead
                    style={{
                      position: "sticky",
                      top: 0,
                      backgroundColor: "#f6f6f7",
                      borderBottom: "2px solid #ddd",
                    }}
                  >
                    <tr>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Code
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Title
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Status
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Usage
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Limit
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Once Per Customer
                      </th>
                      <th style={{ padding: "12px 8px", textAlign: "left", fontWeight: 600 }}>
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fetchedDiscounts.map((discount, index) => {
                      const discountData = discount.discount;
                      const code = discountData?.codes?.nodes?.[0]?.code || "N/A";
                      return (
                        <tr
                          key={discount.id || index}
                          style={{
                            borderBottom: "1px solid #eee",
                            backgroundColor: index % 2 === 0 ? "#fff" : "#fafafa",
                          }}
                        >
                          <td style={{ padding: "10px 8px", fontFamily: "monospace" }}>{code}</td>
                          <td style={{ padding: "10px 8px" }}>{discountData?.title || "N/A"}</td>
                          <td style={{ padding: "10px 8px" }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "12px",
                                fontSize: "12px",
                                backgroundColor:
                                  discountData?.status === "ACTIVE" ? "#d4edda" : "#f8d7da",
                                color: discountData?.status === "ACTIVE" ? "#155724" : "#721c24",
                              }}
                            >
                              {discountData?.status || "N/A"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {discountData?.asyncUsageCount || 0}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {discountData?.usageLimit || "Unlimited"}
                          </td>
                          <td style={{ padding: "10px 8px" }}>
                            {discountData?.appliesOncePerCustomer ? "Yes" : "No"}
                          </td>
                          <td style={{ padding: "10px 8px", fontSize: "12px" }}>
                            {discountData?.createdAt
                              ? new Date(discountData.createdAt).toLocaleDateString()
                              : "N/A"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: "15px" }}>
                <s-button onClick={downloadCSV} variant="secondary">
                  Download CSV
                </s-button>
              </div>
            </s-stack>
          )}

          {!isLoadingDiscounts && fetchedDiscounts.length === 0 && (
            <s-text variant="bodySm" tone="subdued">
              Select a discount function and click &quot;Show&quot; to view discount codes
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
