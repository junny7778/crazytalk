export async function downloadTable(
  name: string,
  headers: string[],
  rows: (string | number)[][],
  additionalSheets: {
    name: string;
    headers: string[];
    rows: (string | number)[][];
  }[] = [],
) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet(name.slice(0, 30));
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };
  sheet.columns.forEach((c) => {
    c.width = 22;
  });
  for (const extra of additionalSheets) {
    const worksheet = book.addWorksheet(extra.name.slice(0, 30));
    worksheet.addRow(extra.headers);
    extra.rows.forEach((row) => worksheet.addRow(row));
    worksheet.getRow(1).font = { bold: true };
    worksheet.columns.forEach((column) => {
      column.width = 22;
    });
  }
  const buffer = await book.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
