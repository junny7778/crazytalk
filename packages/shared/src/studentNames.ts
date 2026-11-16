/** A roster cell may contain two children. Keep their names on the original record. */
export function splitRosterName(raw: string) {
  const text = raw.trim().replace(/[\u200b-\u200d]/g, "");
  const entries = [...text.matchAll(/([\p{Script=Han}·]+)\s*(?:CT\s*\d*|\d+CT)/giu)];
  if (entries.length) {
    const englishNames = entries.map((entry, index) => {
      const end = entries[index + 1]?.index ?? text.length;
      return text.slice(entry.index! + entry[0].length, end).trim();
    });
    return {
      chineseName: entries.map(entry => entry[1]).join(" "),
      englishName: englishNames.filter(name => /\p{Script=Latin}/u.test(name)).join(" / "),
    };
  }
  return /\p{Script=Han}/u.test(text)
    ? { chineseName: text, englishName: "" }
    : { chineseName: "", englishName: text };
}
