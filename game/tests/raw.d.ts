/**
 * Vite's ?raw imports — a module's source as a string. Vitest supports them
 * natively; the project ships no vite/client types, so they are declared here.
 */
declare module "*?raw" {
  const content: string;
  export default content;
}
