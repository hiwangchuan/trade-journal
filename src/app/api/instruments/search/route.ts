import { NextResponse } from "next/server";
import { MockProvider } from "@/lib/market-data/mock";
import { TwelveDataProvider } from "@/lib/market-data/twelve-data";
export async function GET(request: Request) { const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""; if (!query) return NextResponse.json({ results: [] }); const provider = process.env.TWELVE_DATA_API_KEY ? new TwelveDataProvider() : new MockProvider(); try { return NextResponse.json({ results: await provider.searchInstruments(query) }); } catch { return NextResponse.json({ results: await new MockProvider().searchInstruments(query), fallback: true }); } }
