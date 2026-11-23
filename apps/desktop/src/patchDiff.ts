type DiffLine = {
  kind: "context" | "remove" | "add";
  before?: number;
  after?: number;
  text: string;
  ending: "CRLF" | "LF" | "CR" | "EOF";
};

function splitLines(text: string) {
  return text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
}

export function patchDiff(before: string, after: string): DiffLine[] | null {
  const left = splitLines(before);
  const right = splitLines(after);
  const stride = right.length + 1;
  // จำกัดทั้งจำนวนแถวที่แสดงและจำนวนช่องที่ต้องคำนวณ
  if (left.length + right.length > 1000 || (left.length + 1) * stride > 250_000)
    return null;

  const lengths = new Uint16Array((left.length + 1) * stride);
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      const cell = i * stride + j;
      lengths[cell] =
        left[i] === right[j]
          ? lengths[cell + stride + 1] + 1
          : Math.max(lengths[cell + stride], lengths[cell + 1]);
    }
  }

  const rows: DiffLine[] = [];
  function add(
    kind: DiffLine["kind"],
    line: string,
    before?: number,
    after?: number,
  ) {
    const terminator = /\r\n$|[\r\n]$/.exec(line)?.[0];
    const ending =
      terminator === "\r\n"
        ? "CRLF"
        : terminator === "\n"
          ? "LF"
          : terminator === "\r"
            ? "CR"
            : "EOF";
    rows.push({
      kind,
      text: terminator ? line.slice(0, -terminator.length) : line,
      ending,
      before,
      after,
    });
  }

  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && left[i] === right[j]) {
      add("context", left[i], ++i, ++j);
    } else if (
      i < left.length &&
      (j === right.length ||
        lengths[(i + 1) * stride + j] >= lengths[i * stride + j + 1])
    ) {
      add("remove", left[i], ++i);
    } else {
      add("add", right[j], undefined, ++j);
    }
  }
  return rows;
}
