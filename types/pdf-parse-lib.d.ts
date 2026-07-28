// pdf-parse's package root runs a debug block when imported outside CJS
// (the well-known ENOENT ./test/data crash under bundlers), so we import the
// library file directly; it has the same signature as the package root.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
