export function formatStudentProgress(
  value: string | null | undefined,
): string {
  return (value || "")
    .replace(/\s*[·•]\s*/g, " / ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\bp\.?\s*(?=\d)/gi, "P")
    .trim();
}

export function formatMaterialProgress(
  material: string,
  progress: string | null | undefined,
): string {
  return [material.trim(), formatStudentProgress(progress)]
    .filter(Boolean)
    .join(" / ");
}
