const origin = process.env.CT_API_URL || "http://127.0.0.1:3011";
const response = await fetch(new URL("/api/health", origin));
const result = await response.json();
if (!response.ok || result.service !== "crazytalk-api" || result.database !== "ready") {
  throw new Error("Business API or database schema is not ready");
}
console.log("PASS business API and database schema");
