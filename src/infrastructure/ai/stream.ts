/** Decode Chat Completions SSE, including frames and UTF-8 characters split across reads. */
export async function readChatStream(response: Response, onOutput: (text: string) => void) {
  if (!response.body)
    throw new Error('AI service returned no text. Check the model and API compatibility.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '',
    output = '',
    done = false,
    finished = false;
  const consume = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (!data) return;
    if (data === '[DONE]') {
      done = true;
      return;
    }
    const event = JSON.parse(data);
    if (event.error) throw new Error(String(event.error.message ?? 'AI request failed.'));
    const choice =
      event.choices?.find((item: { index?: number }) => item.index === 0) ?? event.choices?.[0];
    const delta = choice?.delta;
    if (delta?.refusal) throw new Error(String(delta.refusal));
    if (typeof delta?.content === 'string') {
      output += delta.content;
      onOutput(output);
    }
    if (choice?.finish_reason) {
      if (choice.finish_reason !== 'stop')
        throw new Error(`AI response incomplete (${choice.finish_reason}).`);
      finished = true;
    }
  };
  try {
    while (!done) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        consume(frame);
        if (done) break;
      }
      if (chunk.done) {
        if (buffer.trim() && !done) consume(buffer);
        break;
      }
    }
    if (!done && !finished) throw new Error('AI stream ended before completion. Please retry.');
    if (!output.trim())
      throw new Error('AI service returned no text. Check the model and API compatibility.');
    return output.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
