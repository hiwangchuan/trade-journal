import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  provider: z.enum(["twelve-data", "eodhd"]).default("twelve-data"),
  apiKey: z.string().trim().min(8, "请输入有效的 API Key。").max(256).regex(/^[^\r\n]+$/, "API Key 格式无效。"),
});

const envPath = path.join(process.cwd(), ".env.local");

export async function GET() {
  return NextResponse.json({
    configured: {
      twelveData: Boolean(process.env.TWELVE_DATA_API_KEY),
      eodhd: Boolean(process.env.EODHD_API_KEY),
    },
  });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "API Key 格式无效。" }, { status: 400 });

  let existing = "";
  try {
    existing = await readFile(envPath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
  }

  const envName = parsed.data.provider === "eodhd" ? "EODHD_API_KEY" : "TWELVE_DATA_API_KEY";
  const lines = existing.split(/\r?\n/).filter((line) => line && !line.startsWith(`${envName}=`));
  lines.push(`${envName}=${JSON.stringify(parsed.data.apiKey)}`);
  await writeFile(envPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
  process.env[envName] = parsed.data.apiKey;

  return NextResponse.json({ provider: parsed.data.provider, configured: true });
}
