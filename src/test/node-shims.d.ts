declare module 'node:fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
  }

  export function readdirSync(
    path: string,
    options: { withFileTypes: true }
  ): Dirent[];
  export function readFileSync(path: string, encoding: 'utf-8'): string;
  export function existsSync(path: string): boolean;

  const fsDefault: {
    readdirSync: typeof readdirSync;
    readFileSync: typeof readFileSync;
    existsSync: typeof existsSync;
  };
  export default fsDefault;
}

declare module 'node:path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(p: string): string;
  export function relative(from: string, to: string): string;

  const pathDefault: {
    join: typeof join;
    resolve: typeof resolve;
    dirname: typeof dirname;
    relative: typeof relative;
  };
  export default pathDefault;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
