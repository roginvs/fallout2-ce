declare const FS;
declare const IDBFS;
declare const MEMFS;

declare const Asyncify;

declare const SYSCALLS;

declare const HEAPU32: Uint32Array;
declare const HEAP8: Uint8Array;

declare function addRunDependency(depName: string);
declare function removeRunDependency(depName: string);

//declare const wasmBinaryFile: string;
declare function findWasmBinary(): string;

declare function _fd_read(
    fd: number,
    iov: number,
    iovcnt: number,
    pnum: number
): number;
declare var _emscripten_set_window_title: (title: string) => void;
