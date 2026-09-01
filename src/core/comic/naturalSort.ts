const numericRun = /(\d+)/g;

export function naturalSortKey(value: string): Array<string | number> {
  return value
    .toLocaleLowerCase("en-US")
    .split(numericRun)
    .filter((part) => part.length > 0)
    .map((part) => (/^\d+$/.test(part) ? Number.parseInt(part, 10) : part));
}

export function naturalCompare(left: string, right: string): number {
  const leftKey = naturalSortKey(left);
  const rightKey = naturalSortKey(right);
  const count = Math.max(leftKey.length, rightKey.length);
  for (let index = 0; index < count; index += 1) {
    const leftPart = leftKey[index];
    const rightPart = rightKey[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart - rightPart;
    }
    return String(leftPart).localeCompare(String(rightPart), "en-US", {
      sensitivity: "base",
    });
  }
  return left.localeCompare(right, "en-US", { sensitivity: "base" });
}

export function naturalSorted<T extends { name: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => naturalCompare(left.name, right.name));
}
