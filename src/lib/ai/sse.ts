export type ServerSentEvent = { event: string; data: string };

function parseEvent(block: string): ServerSentEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  return data.length > 0 ? { event, data: data.join("\n") } : null;
}

export function extractServerSentEvents(buffer: string) {
  const events: ServerSentEvent[] = [];
  let rest = buffer;
  while (true) {
    const lfIndex = rest.indexOf("\n\n");
    const crlfIndex = rest.indexOf("\r\n\r\n");
    const candidates = [lfIndex, crlfIndex].filter((index) => index >= 0);
    if (candidates.length === 0) break;
    const index = Math.min(...candidates);
    const separatorLength = index === crlfIndex ? 4 : 2;
    const event = parseEvent(rest.slice(0, index));
    if (event) events.push(event);
    rest = rest.slice(index + separatorLength);
  }
  return { events, rest };
}

export async function consumeServerSentEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ServerSentEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = extractServerSentEvents(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) onEvent(event);
  }
  buffer += decoder.decode();
  const parsed = extractServerSentEvents(`${buffer}\n\n`);
  for (const event of parsed.events) onEvent(event);
}
