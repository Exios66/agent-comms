export function MentionText({ text }: { text: string }) {
  const parts = text.split(/(@[a-z][a-z0-9_-]{1,31})\b/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={`${part}-${i}`} className="font-mono text-ember">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}
