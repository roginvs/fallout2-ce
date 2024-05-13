export interface FsAttrs {
    dev: 1;
    ino: number;
    mode: number;
    nlink: 1;
    uid: 0;
    gid: 0;
    rdev: undefined;
    size: number;
    atime: Date;
    mtime: Date;
    ctime: Date;
    blksize: 4096;
    blocks: number;
}

export interface FsNodeOps {
    getattr: (node: AsyncFsNode) => FsAttrs;

    setattr: (
        node: AsyncFsNode,
        attr: { mode?: number; timestamp?: number; size?: number }
    ) => void;

    lookup: (parent: AsyncFsNode, name: string) => AsyncFsNode;
    mknod: (
        parent: AsyncFsNode,
        name: string,
        mode: number,
        dev: number
    ) => AsyncFsNode;

    readdir: (node: AsyncFsNode) => string[];

    rename: (
        oldNode: AsyncFsNode,
        newParent: AsyncFsNode,
        newName: string
    ) => void;
    unlink: (parent: AsyncFsNode, name: string) => void;
    rmdir: (parent: AsyncFsNode, name: string) => void;
    symlink: (parent: AsyncFsNode, newname: string, oldpath: string) => void;
}

export interface AsyncFsStream {
    node: AsyncFsNode;
    position: number;
    fd: number;
}

export type FsStreamOps = {
    /** Returns bytes amount */
    read: (
        stream: AsyncFsStream,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number
    ) => number;
    /** Returns bytes written */
    write: (
        stream: AsyncFsStream,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number
    ) => number;

    llseek: (stream: AsyncFsStream, offset: number, whence: number) => number;

    open: (stream: AsyncFsStream) => void;
    close: (stream: AsyncFsStream) => void;
};

export interface FsNode {
    id: number;
    mode: number;
    node_ops: FsNodeOps;
    stream_ops: FsStreamOps;
    timestamp: number;
    name: string;
    parent: FsNode;
}

export interface AsyncFsFile {
    filePath: string;
    size: number;
    content: Uint8Array | null;
}
export interface AsyncFsConfig {
    loadFile: (filePath: string, expectedSize: number) => Promise<Uint8Array>;
    saveFile: (filePath: string, newData: Uint8Array) => Promise<void>;
}
export interface AsyncFsMountOptions<T extends AsyncFsFile> {
    files: T[];
    config: AsyncFsConfig;
}

export interface AsyncFsNode extends FsNode {
    size: number;
    config: AsyncFsConfig;

    /** If it is a directory */
    childNodes?: Record<string, AsyncFsNode>;

    /** If it is a file */
    contents?: Uint8Array;

    unloadTimerId?: number;
    openedCount: number;
    is_memfs: boolean;
}
