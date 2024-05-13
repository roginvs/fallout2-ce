const S_IFDIR = 0o0040000;
const S_IFREG = 0o0100000;

// TODO: Why those values?
const ENOENT = 2;
const EPERM = 1;
const EIO = 5;
const EINVAL = 22;

const SEEK_SET = 0;
const SEEK_CUR = 1;
const SEEK_END = 2;

const DIR_MODE = S_IFDIR | 511; /* 0777 */
const FILE_MODE = S_IFREG | 511; /* 0777 */

if (FILE_MODE === DIR_MODE) {
    throw new Error(`Internal error`);
}

/**
 * @param {import("./asyncfs.types").FsNode} node
 */
function getNodePath(node) {
    let nodePath = "";
    let searchNode = node;
    while (searchNode.name !== "/") {
        nodePath = "/" + searchNode.name + nodePath;
        searchNode = searchNode.parent;
    }
    nodePath = nodePath.slice(1);
    return nodePath;
}

/** @type {import("./asyncfs.types").FsNodeOps['readdir']} */
const readdir = (node) => {
    const entries = [".", ".."];
    if (!node.childNodes) {
        throw new Error(`readdir called on node ${node.name}`);
    }
    for (var key in node.childNodes) {
        if (!node.childNodes.hasOwnProperty(key)) {
            continue;
        }
        entries.push(key);
    }
    return entries;
};

/** @type {import("./asyncfs.types").FsNodeOps['getattr']} */
const getattr = (node) => {
    console.info("getattr", node);
    return {
        dev: 1,
        ino: node.id,
        mode: node.mode,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: undefined,
        size: node.size,
        atime: new Date(node.timestamp),
        mtime: new Date(node.timestamp),
        ctime: new Date(node.timestamp),
        blksize: 4096,
        blocks: Math.ceil(node.size / 4096),
    };
};

/** @type {import("./asyncfs.types").FsNodeOps['setattr']} */
const setattr = (node, attr) => {
    if (attr.mode !== undefined) {
        node.mode = attr.mode;
    }
    if (attr.timestamp !== undefined) {
        node.timestamp = attr.timestamp;
    }
};

/** @type {import("./asyncfs.types").FsStreamOps['llseek']} */
const llseek = (stream, offset, whence) => {
    var position = offset;
    if (whence === SEEK_CUR) {
        position += stream.position;
    } else if (whence === SEEK_END) {
        if (FS.isFile(stream.node.mode)) {
            position += stream.node.size;
        }
    }
    if (position < 0) {
        throw new FS.ErrnoError(EINVAL);
    }
    return position;
};

/**
 * @param {number} num
 */
function makeErrorOp(num) {
    return () => {
        throw new FS.ErrnoError(num);
    };
}

/** @type {import("./asyncfs.types").FsStreamOps['open']} */
const open = (stream) => {
    const node = stream.node;

    if (!FS.isFile(node.mode)) {
        return;
    }

    if (node.unloadTimerId) {
        clearTimeout(node.unloadTimerId);
    }

    if (Asyncify.state == Asyncify.State.Normal) {
        if (node.contents) {
            node.openedCount++;
            return;
        }
    }

    if (node.is_memfs) {
        if (Asyncify.state !== Asyncify.State.Normal) {
            throw new Error(
                `Unexpected Asyncify state=${Asyncify.state}, memfs nodes are not async`
            );
        }

        node.openedCount++;
        return;
    }

    // ___syscall_openat creates new stream everytime it runs
    // We need to close this stream when we run for the first time in async mode
    if (Asyncify.state == Asyncify.State.Normal) {
        FS.closeStream(stream.fd);
    }

    return Asyncify.handleAsync(async () => {
        const data = await node.config.loadFile(getNodePath(node), node.size);
        if (data.byteLength !== node.size) {
            throw new Error(
                `Unexpected size of file ${getNodePath(node)}: ` +
                    `expected ${node.size} but got ${data.byteLength}`
            );
        }
        node.contents = data;
        node.openedCount++;
    });
};

/** @type {import("./asyncfs.types").FsStreamOps['close']} */
const close = (stream) => {
    const node = stream.node;

    node.openedCount--;

    if (node.is_memfs) {
        return;
    }

    if (node.name === "fallout2.cfg") {
        // This is a huge workaround.
        // If we unload fallout2.cfg then game is not able to gracefully exit.
        // Probably somehow related to async open in write mode but i am not sure.
        // TODO: Find out what the hell is happening here
        return;
    }

    if (node.mode === FILE_MODE && node.openedCount === 0) {
        const unloadTimeoutMs = 1000;
        node.unloadTimerId = setTimeout(() => {
            // console.info(`Unloaded node`, node.name)
            if (node.openedCount === 0) {
                node.contents = undefined;
            } else {
                console.warn(`Got unload even but node is opened`);
            }
            node.unloadTimerId = undefined;
        }, unloadTimeoutMs);
    }
};

/** @type {import("./asyncfs.types").FsStreamOps['read']} */
const read = (stream, buffer, offset, length, position) => {
    if (!stream.node.contents) {
        throw new Error(`Node ${stream.node.name} have no content during read`);
    }

    if (position >= stream.node.contents.byteLength) {
        return 0;
    }
    const chunk = stream.node.contents.subarray(position, position + length);
    buffer.set(new Uint8Array(chunk), offset);
    return chunk.byteLength;
};

/** @type {import("./asyncfs.types").FsStreamOps['write']} */
const write = (stream, buffer, offset, length, position) => {
    console.info(
        `ASYNCFETCHFS write ` +
            `${getNodePath(stream.node)} offset=${offset} ` +
            `len=${length} pos=${position} ` +
            `curSize=${stream.node.contents?.byteLength}=${stream.node.size} `
    );
    // console.info(
    //     `ASYNCFETCHFS write`,
    //     stream,
    //     buffer,
    //     offset,
    //     length,
    //     position
    // );
    if (!length) {
        return 0;
    }

    const node = stream.node;
    if (!node.is_memfs) {
        node.is_memfs = true;
    }
    node.timestamp = Date.now();

    if (!node.contents) {
        throw new Error(`Unexpected: no content for writing`);
    }

    if (position + length > node.contents.byteLength) {
        const newBuf = new Uint8Array(position + length);
        newBuf.set(node.contents);
        node.contents = newBuf;
        node.size = newBuf.byteLength;
    }
    node.contents.set(buffer.subarray(offset, offset + length), position);

    return length;
};

function createAsyncNode(
    /** @type {import("./asyncfs.types").AsyncFsNode | null} */
    parent,
    /** @type {string} */
    name,
    /** @type {typeof FILE_MODE | typeof DIR_MODE} */
    mode
) {
    /** @type {import("./asyncfs.types").AsyncFsNode} */
    const node = FS.createNode(parent, name, mode);

    node.timestamp = Date.now();

    node.node_ops = {
        readdir,
        getattr,
        setattr,
        // No need to implement this because underlying FS subsystem caches those on FSNode creation
        lookup: makeErrorOp(EIO),
        mknod: makeErrorOp(EPERM),
        rename: makeErrorOp(EPERM),
        rmdir: makeErrorOp(EPERM),
        unlink: makeErrorOp(EPERM),
        symlink: makeErrorOp(EPERM),
    };
    node.stream_ops = {
        llseek,
        read,
        write,
        open,
        close,
    };
    if (mode === DIR_MODE) {
        node.size = 4096;
        node.childNodes = {};
    } else {
        node.size = 0;
        node.contents = undefined;
    }

    if (parent) {
        node.config = parent.config;
    }

    node.openedCount = 0;
    node.is_memfs = false;

    return node;
}

function ensureParent(
    /** @type {import("./asyncfs.types").AsyncFsNode} */ rootNode,
    /** @type {string} */ path
) {
    const directoryParts = path.split("/").slice(0, -1);
    let curr = rootNode;
    for (const part of directoryParts) {
        if (!curr.childNodes) {
            throw new Error(`Internal error`);
        }
        if (curr.childNodes[part] === undefined) {
            curr.childNodes[part] = createAsyncNode(curr, part, DIR_MODE);
        }
        curr = curr.childNodes[part];
    }
    return curr;
}
function baseName(/** @type {string} */ path) {
    var parts = path.split("/");
    return parts[parts.length - 1];
}

/**
 * @template {import("./asyncfs.types").AsyncFsFile} T
 * @param {{opts: import("./asyncfs.types").AsyncFsMountOptions<T>}} params
 */
function mount(params) {
    const opts = params.opts;
    const rootNode = createAsyncNode(null, "/", DIR_MODE);
    rootNode.config = opts.config;
    for (const file of opts.files) {
        const parentNode = ensureParent(rootNode, file.filePath);
        if (!parentNode.childNodes) {
            throw new Error(`Internal error: must be a directory`);
        }
        const fileName = baseName(file.filePath);
        const fileNode = createAsyncNode(parentNode, fileName, FILE_MODE);
        parentNode.childNodes[fileName] = fileNode;
        fileNode.size = file.size;
        fileNode.contents = file.content || undefined;
    }
    return rootNode;
}
export const asyncfs = {
    mount,
};
