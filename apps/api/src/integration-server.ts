// Test harness rejects external HTTP before starting the real API application.
const fetchLocal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("Integration test rejected external HTTP");
  }
  return fetchLocal(input, init);
};
async function start() {
  let blocked = false;
  try {
    await fetch(
      "https://www.eeo.cn/partner/api/school.api.php?action=addCourse",
    );
  } catch (error) {
    blocked =
      error instanceof Error &&
      error.message === "Integration test rejected external HTTP";
  }
  if (!blocked) throw new Error("External HTTP isolation failed");
  await import("./main");
}
void start();
