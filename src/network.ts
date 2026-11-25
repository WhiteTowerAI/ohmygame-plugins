// Reading the network for the index job.

/** A fetch that tries again on a network error or a 5xx/429 answer. */
export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || attempt >= 3 || (response.status < 500 && response.status !== 429)) return response;
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}
