import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Provisioner } from "./provisioner.ts";

/** Local libSQL files in one folder, for `dev:local` and tests. */
export class LocalProvisioner implements Provisioner {
  constructor(private readonly dir: string) {}

  async create(name: string): Promise<string> {
    return `file:${join(this.dir, `${name}.db`)}`;
  }

  async delete(name: string): Promise<void> {
    const file = join(this.dir, `${name}.db`);
    await Promise.all([file, `${file}-wal`, `${file}-shm`].map((path) => rm(path, { force: true })));
  }
}
