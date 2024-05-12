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
        attr: { mode?: number; timestamp?: number }
    ) => void;

    lookup?: (parent: AsyncFsNode, name: string) => AsyncFsNode;
    mknod: (
        parent: AsyncFsNode,
        name: string,
        mode: number,
        dev: number
    ) => AsyncFsNode;

    readdir: (node: AsyncFsNode) => string[];
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
}

export interface AsyncFsNode extends FsNode {
    size: number;
}
