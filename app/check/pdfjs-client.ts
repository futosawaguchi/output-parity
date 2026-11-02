// pdfjs for the browser, with one worker for the whole page.
// Every document is given this worker explicitly. pdfjs destroys a worker together with a
// loading task only when it created that worker itself, so closing one view (switching rows,
// a remount in development) can no longer break the documents other views are still loading.

type Pdfjs = typeof import("pdfjs-dist");

let loaded: Promise<{ pdfjs: Pdfjs; worker: InstanceType<Pdfjs["PDFWorker"]> }> | null = null;

export function loadPdfjs() {
  loaded ??= import("pdfjs-dist/webpack.mjs").then((pdfjs) => ({
    pdfjs,
    // webpack.mjs has already started the worker script and put its port here.
    worker: pdfjs.PDFWorker.create({ port: pdfjs.GlobalWorkerOptions.workerPort ?? undefined }),
  }));
  return loaded;
}
