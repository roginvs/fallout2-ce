// Emscripten JS library. Linked only into JSPI builds.
//
// The stock ___syscall_openat does `return FS.open(...).fd` and drops whatever
// stream_ops.open returns. Asyncify notices the state change anyway. JSPI
// suspends only when this import's return value is a Promise, so the open of
// an ASYNCFETCHFS file has to wait for stream.asyncOpen before the fd is
// returned to Wasm.
addToLibrary({
    __syscall_openat__deps: ["$SYSCALLS", "$FS"],
    __syscall_openat__async: true,
    __syscall_openat: (dirfd, path, flags, varargs) => {
        SYSCALLS.varargs = varargs;
        try {
            path = SYSCALLS.getStr(path);
            path = SYSCALLS.calculateAt(dirfd, path);
            var mode = 0;
            if (varargs) {
                // Same read as syscallGetVarargI, which is an internal symbol.
                mode = HEAP32[(SYSCALLS.varargs >> 2)];
                SYSCALLS.varargs += 4;
            }
            var stream = FS.open(path, flags, mode);
            var fd = stream.fd;
            var pending = stream.asyncOpen;
            if (pending && typeof pending.then === "function") {
                return pending.then(
                    () => fd,
                    (error) => {
                        if (error && error.name === "ErrnoError") {
                            return -error.errno;
                        }
                        throw error;
                    },
                );
            }
            return Promise.resolve(fd);
        } catch (error) {
            if (
                typeof FS == "undefined" ||
                !(error && error.name === "ErrnoError")
            ) {
                throw error;
            }
            return Promise.resolve(-error.errno);
        }
    },
});
