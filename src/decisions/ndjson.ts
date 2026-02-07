import fs from "node:fs";
import readline from "node:readline";

export async function readNdjsonFile<T>(
  filePath: string,
  mapper: (value: unknown) => T | null,
): Promise<T[]> {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const stream = fs.createReadStream(filePath, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const entries: T[] = [];
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as unknown;
      const mapped = mapper(parsed);
      if (mapped) {
        entries.push(mapped);
      }
    } catch {
      continue;
    }
  }
  return entries;
}
