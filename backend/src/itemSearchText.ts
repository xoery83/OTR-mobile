// Unicode 17.0 C+F mapping from unicode.org/Public/17.0.0/ucd/CaseFolding.txt.
// © 2025 Unicode, Inc.; see UNICODE-LICENSE.txt. Source SHA256 ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183.
import mappings from "./unicodeCaseFold.json";
const folds: Readonly<Record<string, string>> = mappings;
export const itemSearchText = (value: string) =>
  Array.from(value.normalize("NFKC"), (character) => folds[character] ?? character).join(
    "",
  );
