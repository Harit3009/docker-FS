import { Transform, TransformCallback } from 'stream';

interface ChunkerOptions {
  chunkSize: number;
  chunkOverlap: number;
}

export class StreamingChunker extends Transform {
  private buffer: string = '';
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  // Priority list of delimiters (Recursive style)
  private readonly separators = ['\n\n', '\n', '. ', ' '];

  constructor(options: ChunkerOptions) {
    super({ objectMode: true }); // We emit strings (chunks), not raw bytes
    this.chunkSize = options.chunkSize;
    this.chunkOverlap = options.chunkOverlap;
  }

  _transform(chunk: any, encoding: string, callback: TransformCallback): void {
    // 1. Append new data to internal buffer
    this.buffer += chunk.toString();

    // 2. While we have enough data to make a chunk...
    while (this.buffer.length >= this.chunkSize) {
      this.processChunk();
    }

    callback();
  }

  // ... inside StreamingChunker class

  private processChunk(isFinal = false) {
    if (!isFinal && this.buffer.length < this.chunkSize) return;

    // 1. Find the End of Current Chunk (Backward Look)
    // We try to cut exactly at chunkSize, but snap backward to a sentence end
    let cutIndex = Math.min(this.chunkSize, this.buffer.length);

    // Only search backwards if we aren't forced to flush everything (isFinal)
    // and if we have enough buffer to look back safely.
    if (!isFinal) {
      cutIndex = this.findBestCutIndex(cutIndex);
    }

    // 2. Extract the Current Chunk
    const chunkText = this.buffer.slice(0, cutIndex).trim();
    if (chunkText.length > 0) {
      this.push(chunkText);
    }

    // 3. Handle the "Slide" (The Overlap Logic)
    if (isFinal && cutIndex === this.buffer.length) {
      this.buffer = '';
    } else {
      // A. Calculate the Naive Start (Strict math)
      let overlapStart = Math.max(0, cutIndex - this.chunkOverlap);

      // B. THE FIX: Look ahead to find a clean start
      // We don't want the next chunk to start with "ing. The..."
      // We want it to start with "The..."
      overlapStart = this.findCleanOverlapStart(overlapStart, cutIndex);

      // C. Construct the new buffer
      // New Buffer = (Clean Overlap) + (Rest of stream)
      const overlapText = this.buffer.slice(overlapStart, cutIndex);
      const remainingText = this.buffer.slice(cutIndex);

      this.buffer = overlapText + remainingText;
    }
  }

  /**
   * Looks BACKWARDS from limit to find the best place to END a chunk.
   */
  private findBestCutIndex(limit: number): number {
    // Try priority: Double Newline -> Newline -> Period -> Space
    for (const sep of this.separators) {
      const lastSepIndex = this.buffer.lastIndexOf(sep, limit);
      // Ensure we don't cut too early (e.g., don't create a 10-char chunk)
      if (lastSepIndex !== -1 && lastSepIndex > this.chunkSize * 0.5) {
        return lastSepIndex + sep.length;
      }
    }
    // Fallback: Hard cut at limit
    return limit;
  }

  /**
   * Looks FORWARDS from naiveStart to find the best place to START the next chunk.
   * Ensures we don't accidentally shrink the overlap to near-zero.
   */
  private findCleanOverlapStart(naiveStart: number, cutIndex: number): number {
    // Safety check
    if (naiveStart >= cutIndex) return naiveStart;

    const windowText = this.buffer.slice(naiveStart, cutIndex);

    // Define a "Minimum Meaningful Overlap"
    // If the found separator leaves us with less than this, we reject it.
    // e.g., if we want 200 overlap, we shouldn't accept less than 50.
    const MIN_OVERLAP_CHARS = Math.floor(this.chunkOverlap * 0.25);

    for (const sep of this.separators) {
      const relativeIndex = windowText.indexOf(sep);

      if (relativeIndex !== -1) {
        const potentialStart = naiveStart + relativeIndex + sep.length;
        const resultingOverlapSize = cutIndex - potentialStart;

        // FIX IS HERE:
        // If snapping to this separator kills our overlap (e.g. leaves only 5 chars),
        // ignore it and keep looking or fall back.
        if (resultingOverlapSize > MIN_OVERLAP_CHARS) {
          return potentialStart;
        }
      }
    }

    // Fallback 1: Try snapping to a space (if sentence separators failed or were too short)
    const spaceIndex = windowText.indexOf(' ');
    if (spaceIndex !== -1) {
      const potentialStart = naiveStart + spaceIndex + 1;
      const resultingOverlapSize = cutIndex - potentialStart;

      if (resultingOverlapSize > MIN_OVERLAP_CHARS) {
        return potentialStart;
      }
    }

    // Fallback 2 (The "Safety Net"):
    // If we can't find a clean break that preserves enough context,
    // we MUST use the naive start. It cuts a word in half, but it guarantees
    // the next chunk has the 200 characters of context it needs.
    return naiveStart;
  }

  _flush(callback: TransformCallback): void {
    // 3. Process any remaining data in the buffer
    while (this.buffer.length > 0) {
      // If remaining text is smaller than overlap, just emit it if it's substantial
      // or if it's the very last piece.
      if (this.buffer.length < this.chunkOverlap && this.buffer.length > 0) {
        this.push(this.buffer);
        this.buffer = '';
      } else {
        this.processChunk(true); // true = force emit even if small
      }
    }
    callback();
  }
}
