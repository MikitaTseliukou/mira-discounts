import { HttpRequestMethod } from "../generated/api";


export function cartLinesDiscountsGenerateFetch(input) {
    const { enteredDiscountCodes } = input;

  const request = {
    headers: [
      {
        name: "accept",
        value: "application/json",
      },
      {
        name: "Content-Type",
        value: "application/json",
      },
    ],
    method: HttpRequestMethod.Post,
    policy: {
      readTimeoutMs: 5000,
    },
    // [START discount-function.cart.fetch.url]
    url: "https://mira-lab-test-k37rp.ondigitalocean.app/api/fetch-discount-codes",
    // [END discount-function.cart.fetch.url]
    body: JSON.stringify(enteredDiscountCodes),
  };

  return { request };
}