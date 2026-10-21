/** Creates and deletes the per-account note databases. */
export interface Provisioner {
  /** Create an empty database and return the URL to connect to it. */
  create(name: string): Promise<string>;
  delete(name: string): Promise<void>;
}

const TURSO_API = "https://api.turso.tech/v1";

/**
 * Turso Cloud through the Platform API. Every demo database lives in one group, so a single group token
 * (TURSO_GROUP_TOKEN) opens all of them and no per-database token has to be stored.
 */
export class TursoProvisioner implements Provisioner {
  constructor(
    private readonly options: { org: string; platformToken: string; group: string },
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${TURSO_API}/organizations/${encodeURIComponent(this.options.org)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.options.platformToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async create(name: string): Promise<string> {
    const response = await this.call("POST", "/databases", { name, group: this.options.group });
    if (!response.ok) throw new Error(`Turso create ${name} failed: ${response.status} ${await response.text()}`);
    const { database } = (await response.json()) as { database: { Hostname: string } };
    return `libsql://${database.Hostname}`;
  }

  async delete(name: string): Promise<void> {
    const response = await this.call("DELETE", `/databases/${encodeURIComponent(name)}`);
    // Already gone counts as deleted, so a retried expiry run doesn't get stuck.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Turso delete ${name} failed: ${response.status} ${await response.text()}`);
    }
  }
}
