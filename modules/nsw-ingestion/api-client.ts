import type { NswApiFilters, NswApiResponse, NswRawApplication, NswSource } from "./types";

const BASE_URL = "https://api.apps1.nsw.gov.au/eplanning/data/v0";

const ENDPOINT_PATH: Record<NswSource, string> = {
  DA: "OnlineDA",
  CDC: "OnlineCDC",
};

const DEFAULT_PAGE_SIZE = 1000;
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPage(
  source: NswSource,
  pageNumber: number,
  pageSize: number,
  filters: NswApiFilters,
): Promise<NswApiResponse> {
  const url = `${BASE_URL}/${ENDPOINT_PATH[source]}`;
  const headers = {
    PageSize: String(pageSize),
    PageNumber: String(pageNumber),
    filters: JSON.stringify({ filters }),
    Accept: "application/json",
    "User-Agent": "council-leads-nsw-ingestion (contact: campbell.davis90@gmail.com)",
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        return (await response.json()) as NswApiResponse;
      }

      // Don't retry client errors (bad filters etc.) — only transient/server errors.
      if (response.status < 500) {
        throw new Error(
          `NSW API ${source} request failed: ${response.status} ${response.statusText}`,
        );
      }

      lastError = new Error(
        `NSW API ${source} request failed: ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`NSW API ${source} request failed after ${MAX_RETRIES + 1} attempts`);
}

/**
 * Pages through all Application records matching `filters`, yielding one page
 * (array of records) at a time. Stops once PageNumber exceeds TotalPages.
 */
export async function* iterateApplications(
  source: NswSource,
  filters: NswApiFilters = {},
  pageSize: number = DEFAULT_PAGE_SIZE,
): AsyncGenerator<NswRawApplication[], void, void> {
  let pageNumber = 1;
  let totalPages = 1;

  do {
    const response = await fetchPage(source, pageNumber, pageSize, filters);
    totalPages = response.TotalPages;
    // The API omits `Application` entirely (rather than `[]`) when a page's
    // filters match zero records — confirmed live for narrow date windows.
    yield response.Application ?? [];
    pageNumber += 1;
  } while (pageNumber <= totalPages);
}
