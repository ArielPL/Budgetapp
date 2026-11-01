// Tests read binary fixtures (.xlsx, .docx) from disk, and the app's tsconfig
// carries no Node types — the app itself never touches the file system. Only
// the one function the tests use is declared.
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
}
