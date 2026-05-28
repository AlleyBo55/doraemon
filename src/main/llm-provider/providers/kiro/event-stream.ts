export interface EventStreamFrame {
  headers: Record<string, string>;
  payload: Uint8Array;
}

export interface EventStreamParseResult {
  frames: EventStreamFrame[];
  remainder: Uint8Array;
}

const MIN_FRAME_TOTAL_LENGTH = 16;
const MAX_FRAME_TOTAL_LENGTH = 16 * 1024 * 1024;

const HEADER_TYPE_BYTES = 6;
const HEADER_TYPE_STRING = 7;

function readUint32BE(buf: Uint8Array, offset: number): number {
  return (
    ((buf[offset]! << 24) |
      (buf[offset + 1]! << 16) |
      (buf[offset + 2]! << 8) |
      buf[offset + 3]!) >>>
    0
  );
}

function tryParseFrame(
  buf: Uint8Array,
  offset: number,
): { frame: EventStreamFrame; nextOffset: number } | { needMore: true } | { skipBytes: number } {
  if (buf.length - offset < MIN_FRAME_TOTAL_LENGTH) return { needMore: true };

  const totalLen = readUint32BE(buf, offset);
  const headersLen = readUint32BE(buf, offset + 4);

  if (totalLen < MIN_FRAME_TOTAL_LENGTH || totalLen > MAX_FRAME_TOTAL_LENGTH) {
    return { skipBytes: 1 };
  }
  if (headersLen > totalLen) {
    return { skipBytes: 1 };
  }
  if (buf.length - offset < totalLen) return { needMore: true };

  const headersStart = offset + 12;
  const headersEnd = headersStart + headersLen;
  const payloadStart = headersEnd;
  const payloadEnd = offset + totalLen - 4;

  if (payloadEnd < payloadStart) {
    return { skipBytes: 1 };
  }

  const headers: Record<string, string> = {};
  let cursor = headersStart;
  while (cursor < headersEnd) {
    const nameLen = buf[cursor]!;
    cursor += 1;
    if (cursor + nameLen > headersEnd) break;
    const nameBytes = buf.subarray(cursor, cursor + nameLen);
    const name = new TextDecoder('utf-8', { fatal: false }).decode(nameBytes);
    cursor += nameLen;
    if (cursor + 1 > headersEnd) break;
    const headerType = buf[cursor]!;
    cursor += 1;

    if (headerType === HEADER_TYPE_BYTES || headerType === HEADER_TYPE_STRING) {
      if (cursor + 2 > headersEnd) break;
      const valueLen = (buf[cursor]! << 8) | buf[cursor + 1]!;
      cursor += 2;
      if (cursor + valueLen > headersEnd) break;
      const valueBytes = buf.subarray(cursor, cursor + valueLen);
      headers[name] = new TextDecoder('utf-8', { fatal: false }).decode(valueBytes);
      cursor += valueLen;
    } else {
      break;
    }
  }

  const payload = buf.slice(payloadStart, payloadEnd);
  return {
    frame: { headers, payload },
    nextOffset: offset + totalLen,
  };
}

export function parseEventStream(buf: Uint8Array): EventStreamParseResult {
  const frames: EventStreamFrame[] = [];
  let offset = 0;

  while (offset < buf.length) {
    const result = tryParseFrame(buf, offset);

    if ('needMore' in result) {
      break;
    }
    if ('skipBytes' in result) {
      offset += Math.max(1, result.skipBytes);
      continue;
    }
    frames.push(result.frame);
    offset = result.nextOffset;
  }

  return { frames, remainder: buf.slice(offset) };
}

export function decodePayloadAsJson(payload: Uint8Array): unknown {
  if (payload.length === 0) return null;
  const text = new TextDecoder('utf-8', { fatal: false }).decode(payload);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
