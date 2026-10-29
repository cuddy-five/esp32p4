const ERROR_PATTERNS = /(?:error|fail|exception|assert|traceback|panic|reject|fatal)/i;
const EXIT_PATTERNS = /(?:exit(?:ed)?\s+(?:with\s+code\s+)?\d+|process\s+exited|finished\s+with\s+exit\s+code)/i;
const WARNING_PATTERNS = /(?:warn|warning|caution|deprecated|unhandled)/i;
const PROGRESS_PATTERNS = /(?:^\s*\[\s*\d+%\s*\]|kB\/s|\/s\b|\.{6,}|===+>|fetching|downloading|unpacking|compiling|building|step\s+\d+)/i;
const STACK_FRAME_PATTERN = /^\s+(?:at\s+|File\s+["'].*["'],\s+line\s+\d+|[a-zA-Z0-9_]+@[a-zA-Z0-9_]+)/;

/**
 * Break raw log text into semantic chunks, grouping multi-line stack traces
 * together so they are scored and kept as coherent units.
 *
 * @param {string} text
 * @param {number} [maxChunkLines=6]
 * @returns {Array<{ id: string, text: string, lineStart: number, lineCount: number }>}
 */
export function chunkLog(text, maxChunkLines = 6) {
  if (typeof text !== "string" || text.length === 0) return [];
  const lines = text.split("\n");
  const chunks = [];
  let currentLines = [];
  let chunkStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isStack = STACK_FRAME_PATTERN.test(line);
    const isError = ERROR_PATTERNS.test(line);
    const isExit = EXIT_PATTERNS.test(line);

    if (currentLines.length === 0) {
      chunkStart = i;
      currentLines.push(line);
      continue;
    }

    // Keep stack frames attached to the preceding error line
    if (isStack && currentLines.length < maxChunkLines * 2) {
      currentLines.push(line);
      continue;
    }

    // Flush current chunk so an error or exit status line starts cleanly
    if ((isError || isExit) && currentLines.length > 0 && !ERROR_PATTERNS.test(currentLines[0])) {
      chunks.push({
        id: `c_${chunks.length}`,
        text: currentLines.join("\n"),
        lineStart: chunkStart,
        lineCount: currentLines.length,
      });
      chunkStart = i;
      currentLines = [line];
      continue;
    }

    if (currentLines.length >= maxChunkLines) {
      chunks.push({
        id: `c_${chunks.length}`,
        text: currentLines.join("\n"),
        lineStart: chunkStart,
        lineCount: currentLines.length,
      });
      chunkStart = i;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    chunks.push({
      id: `c_${chunks.length}`,
      text: currentLines.join("\n"),
      lineStart: chunkStart,
      lineCount: currentLines.length,
    });
  }

  return chunks;
}

/**
 * Fast deterministic heuristic scoring for offline mode or fallback.
 * Returns score from 0.0 to 3.0.
 *
 * @param {string} chunkText
 * @param {number} index
 * @param {number} totalChunks
 * @returns {number}
 */
export function deterministicScoreChunk(chunkText, index, totalChunks) {
  // Head lines (invocation) and tail lines (exit status) get baseline priority
  if (index === 0) return 2.5;
  if (index === totalChunks - 1) return 3.0;

  if (ERROR_PATTERNS.test(chunkText)) return 3.0;
  if (EXIT_PATTERNS.test(chunkText)) return 3.0;
  if (WARNING_PATTERNS.test(chunkText)) return 2.0;
  if (PROGRESS_PATTERNS.test(chunkText)) return 0.1;
  return 1.0;
}

/**
 * Compact raw log text using deterministic local scoring.
 *
 * Guarantees:
 * 1. Never returns empty string if text has content.
 * 2. Never exceeds maxChars.
 * 3. Preserves invocation head and exit status tail verbatim.
 * 4. Preserves critical errors verbatim, pruning progress lines between them.
 * 5. Inserts explicit pruning notices where content is skipped.
 *
 * @param {string} text - Raw terminal or test log text
 * @param {{
 *   maxChars?: number,
 * }} [opts]
 * @returns {Promise<{
 *   compacted: string,
 *   originalChars: number,
 *   compactedChars: number,
 *   reductionPercent: number,
 *   method: "deterministic",
 *   prunedChunks: number,
 * }>}
 */
export async function compactLogs(text, {
  maxChars = 2000,
} = {}) {
  if (typeof text !== "string" || text.length === 0) {
    return {
      compacted: "",
      originalChars: 0,
      compactedChars: 0,
      reductionPercent: 0,
      method: "deterministic",
      prunedChunks: 0,
    };
  }

  const originalChars = text.length;
  if (originalChars <= maxChars) {
    return {
      compacted: text,
      originalChars,
      compactedChars: originalChars,
      reductionPercent: 0,
      method: "deterministic",
      prunedChunks: 0,
    };
  }

  if (maxChars < 15) {
    const compacted = text.slice(0, maxChars);
    return {
      compacted,
      originalChars,
      compactedChars: compacted.length,
      reductionPercent: Math.max(0, Number(((1 - compacted.length / originalChars) * 100).toFixed(1))),
      method: "deterministic",
      prunedChunks: 0,
    };
  }

  if (maxChars < 120) {
    const sliceLen = maxChars - 15;
    const compacted = `${text.slice(0, sliceLen)}... [truncated]`;
    return {
      compacted,
      originalChars,
      compactedChars: compacted.length,
      reductionPercent: Math.max(0, Number(((1 - compacted.length / originalChars) * 100).toFixed(1))),
      method: "deterministic",
      prunedChunks: 0,
    };
  }

  const chunks = chunkLog(text);
  if (chunks.length <= 1) {
    const sliceLen = maxChars - 15;
    const compacted = `${text.slice(0, sliceLen)}... [truncated]`;
    return {
      compacted,
      originalChars,
      compactedChars: compacted.length,
      reductionPercent: Math.max(0, Number(((1 - compacted.length / originalChars) * 100).toFixed(1))),
      method: "deterministic",
      prunedChunks: 0,
    };
  }

  let method = "deterministic";
  const scores = new Map();

  // Populate deterministic heuristic scores as baseline for all chunks
  for (let i = 0; i < chunks.length; i++) {
    scores.set(chunks[i].id, deterministicScoreChunk(chunks[i].text, i, chunks.length));
  }

  // Budget allocation:
  // Reserve up to 20% for head (invocation)
  // Reserve up to 25% for tail (exit status/summary)
  const headBudget = Math.floor(maxChars * 0.20);
  const tailBudget = Math.floor(maxChars * 0.25);
  const PRUNE_NOTICE = "[... non-critical output pruned by context compaction ...]";

  // 1. Fit head chunk
  const headChunk = chunks[0];
  let headText = headChunk.text;
  if (headText.length > headBudget) {
    headText = `${headText.slice(0, Math.max(10, headBudget - 15))}... [truncated]`;
  }

  // 2. Fit tail chunk
  const tailChunk = chunks[chunks.length - 1];
  let tailText = tailChunk.text;
  if (tailText.length > tailBudget) {
    tailText = `... [truncated]\n${tailText.slice(-Math.max(10, tailBudget - 15))}`;
  }

  function assemble(middleList) {
    const parts = [headText];
    let lastEnd = headChunk.lineStart + headChunk.lineCount;
    for (const m of middleList) {
      if (m.lineStart > lastEnd) {
        parts.push(PRUNE_NOTICE);
      }
      parts.push(m.text);
      lastEnd = m.lineStart + m.lineCount;
    }
    if (tailChunk.lineStart > lastEnd) {
      parts.push(PRUNE_NOTICE);
    }
    parts.push(tailText);
    return parts.join("\n");
  }

  // 3. Select middle chunks sorted by score, then reassembled in chronological order
  const middleCandidates = chunks.slice(1, -1);
  const ranked = [...middleCandidates].sort((a, b) => {
    const scoreA = scores.get(a.id) ?? 1.0;
    const scoreB = scores.get(b.id) ?? 1.0;
    return scoreB - scoreA;
  });

  let selectedMiddle = [];

  for (const chunk of ranked) {
    const score = scores.get(chunk.id) ?? 1.0;
    // Don't include low-utility progress chunks if budget is tight
    if (score < 1.0 && selectedMiddle.length > 0) continue;

    // Test adding this chunk in chronological order
    const candidateMiddle = [...selectedMiddle, chunk].sort((a, b) => a.lineStart - b.lineStart);
    const candidateText = assemble(candidateMiddle);

    if (candidateText.length <= maxChars) {
      selectedMiddle = candidateMiddle;
      continue;
    }

    // If candidate doesn't fit completely but is a critical error (score >= 2.5),
    // try trimming this chunk to fit whatever space remains
    if (score >= 2.5) {
      const baseOutput = assemble(selectedMiddle);
      const remainingChars = maxChars - baseOutput.length - (PRUNE_NOTICE.length + 2);
      if (remainingChars > 30) {
        const trimmedChunk = {
          ...chunk,
          text: `${chunk.text.slice(0, remainingChars - 15)}... [truncated]`,
        };
        const trimmedCandidate = [...selectedMiddle, trimmedChunk].sort((a, b) => a.lineStart - b.lineStart);
        if (assemble(trimmedCandidate).length <= maxChars) {
          selectedMiddle = trimmedCandidate;
        }
      }
    }
  }

  const finalCompacted = assemble(selectedMiddle);
  const prunedChunks = chunks.length - (1 + selectedMiddle.length + 1);
  const reductionPercent = Number(((1 - finalCompacted.length / originalChars) * 100).toFixed(1));

  return {
    compacted: finalCompacted,
    originalChars,
    compactedChars: finalCompacted.length,
    reductionPercent: Math.max(0, reductionPercent),
    method,
    prunedChunks: Math.max(0, prunedChunks),
  };
}
