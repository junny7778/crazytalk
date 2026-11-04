import { z } from "zod";
const draftSchema = z.object({
  material: z.string().default(""),
  unit: z.string(),
  page: z.string(),
  rating: z.number(),
  comment: z.string(),
  level: z.string(),
});
export const readString = (key: string, fallback: string) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};
export const writeString = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Browsing without storage still allows the current session. */
  }
};
export function readDraft(id: string) {
  try {
    const raw = localStorage.getItem(`ct-teacher-draft-${id}`);
    return raw ? draftSchema.safeParse(JSON.parse(raw)).data : undefined;
  } catch {
    return undefined;
  }
}
export function currency(amount: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amount);
}
