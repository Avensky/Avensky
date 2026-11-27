/** Presentation only. Keep the saved spelling for input and exact-name confirmation. */
export function formatCharacterName(name: string): string {
  return name.replace(/\p{L}[\p{L}\p{M}\d]*/gu, (word, index: number) => {
    // Keep a trailing generational suffix, as in Track Fox II.
    if (name[index - 1] === " " && index + word.length === name.length && /^(?:ii|iii|iv|vi{0,3}|ix|x)$/i.test(word)) {
      return word.toUpperCase();
    }
    const letters = word === word.toUpperCase() ? word.toLowerCase() : word;
    return letters.replace(/^\p{L}/u, initial => initial.toUpperCase());
  });
}
