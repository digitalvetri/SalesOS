// The sheet row behind an imported order, kept exactly as typed so the app can
// show "what the Excel said" next to the numbers it derived (Order.sheetRow).
// Every value is display text; null = the cell was empty.
export type SheetRow = {
  sheet: string; // "MALLIKA"
  rows: number[]; // 1-based Excel rows that make up the order (multi-row orders have several)
  date: string | null; // as typed, or dd/mm/yyyy for Excel date cells
  customer: string | null;
  name?: string | null; // the customer name the import read from the row (cleaned; may come from CONTACT)
  contact: string | null;
  products: string | null; // lines joined with ", "
  total: string | null;
  adv: string | null;
  bal: string | null;
  delivery: string | null;
  status: string | null;
  acc: string | null; // ACC DETAILS — where the money went
  comments: string | null; // COMMENTS / DETAIL / remarks
};

export function readSheetRow(v: unknown): SheetRow | null {
  if (!v || typeof v !== "object" || !("sheet" in v)) return null;
  return v as SheetRow;
}
