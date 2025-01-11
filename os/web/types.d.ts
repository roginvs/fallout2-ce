declare const FS;
declare const IDBFS;
declare const MEMFS;

declare const Asyncify;

declare function addRunDependency(depName: string);
declare function removeRunDependency(depName: string);

//declare const wasmBinaryFile: string;
declare function findWasmBinary(): string;

declare var _emscripten_set_window_title: (title: string) => void;
