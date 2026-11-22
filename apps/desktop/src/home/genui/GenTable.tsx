import { useId, useState } from "react";
import type { GenBlock } from "./spec";

type Table = Extract<GenBlock, { type: "table" }>;
const pageSize = 8;
const collator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});
const cellText = (cell: Table["rows"][number][number]) =>
  typeof cell === "boolean" ? (cell ? "ใช่" : "ไม่ใช่") : String(cell ?? "—");

export function GenTable({ item }: { item: Table }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ index: number; asc: boolean }>();
  const match = query.trim().toLocaleLowerCase("th");
  const rows = item.rows
    .map((cells, index) => ({ cells, index }))
    .filter(
      ({ cells }) =>
        !match ||
        cells.some((cell) =>
          cellText(cell).toLocaleLowerCase("th").includes(match),
        ),
    );
  if (sort) {
    rows.sort((a, b) => {
      const first = a.cells[sort.index];
      const second = b.cells[sort.index];
      if (first === null || second === null)
        return Number(first === null) - Number(second === null);
      const order =
        typeof first === "number" && typeof second === "number"
          ? first - second
          : collator.compare(cellText(first), cellText(second));
      return sort.asc ? order : -order;
    });
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  return (
    <>
      {item.rows.length > 0 && (
        <label htmlFor={id}>
          ค้นหาในตาราง
          <input
            id={id}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
      )}
      <div
        className="genui-table-scroll"
        role="region"
        aria-label={item.title}
        tabIndex={0}
      >
        <table aria-label={item.title}>
          <thead>
            <tr>
              {item.columns.map((name, index) => (
                <th
                  key={index}
                  scope="col"
                  aria-sort={
                    sort?.index === index
                      ? sort.asc
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSort({
                        index,
                        asc: sort?.index !== index || !sort.asc,
                      });
                      setPage(0);
                    }}
                  >
                    {name}
                    {sort?.index === index && (
                      <span aria-hidden="true">{sort.asc ? " ↑" : " ↓"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice(current * pageSize, (current + 1) * pageSize)
              .map(({ cells, index }) => (
                <tr key={index}>
                  {cells.map((cell, column) => (
                    <td key={column}>{cellText(cell)}</td>
                  ))}
                </tr>
              ))}
            {!rows.length && (
              <tr>
                <td colSpan={item.columns.length}>
                  {match ? "ไม่พบรายการที่ตรงกับคำค้น" : "ยังไม่มีข้อมูล"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="genui-controls">
        <span role="status">
          {rows.length} รายการ
          {pages > 1 ? ` · หน้า ${current + 1}/${pages}` : ""}
        </span>
        {pages > 1 && (
          <>
            <button
              type="button"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              disabled={current + 1 === pages}
              onClick={() => setPage(current + 1)}
            >
              ถัดไป
            </button>
          </>
        )}
      </div>
    </>
  );
}
