import { parseCustomerRoster } from "./customerRoster";
import type { DemoState, StudentProfileInput } from "@crazytalk/shared";

export async function readStudentWorkbook(
  buffer: ArrayBuffer,
  data: DemoState,
): Promise<{
  rows: StudentProfileInput[];
  warnings: string[];
  skipped: number;
}> {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  try {
    await book.xlsx.load(buffer);
  } catch (error) {
    // Some WPS exports prefix rich-text runs with an empty plain-text node.
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const strings = await zip.file("xl/sharedStrings.xml")?.async("string");
    const fixed = strings?.replace(
      /(<si>)\s*<t(?:\s[^>]*)?(?:\/>|>\s*<\/t>)\s*(?=<r>)/g,
      "$1",
    );
    if (!fixed || fixed === strings) throw error;
    zip.file("xl/sharedStrings.xml", fixed);
    await book.xlsx.load(await zip.generateAsync({ type: "arraybuffer" }));
  }
  const sheet = book.worksheets.find((s) => s.actualRowCount > 0);
  if (!sheet) throw new Error("文件没有可读取的学员表。");
  const customer = parseCustomerRoster(sheet, data);
  if (customer) return customer;
  throw new Error("无法识别学生信息表，请下载当前模板。");
}
