import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

import {
  canAccessObject,
  getObjectAclPolicy,
  ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from './objectAcl';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface StorageFileLike {
  name: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[{ metadata?: Record<string, unknown>; contentType?: string; size?: number }]>;
  setMetadata(meta: { metadata?: Record<string, unknown> }): Promise<unknown>;
  createReadStream(): NodeJS.ReadableStream;
}

export class LocalStorageFile implements StorageFileLike {
  constructor(
    public readonly name: string,
    public readonly absolutePath: string,
  ) {}

  async exists(): Promise<[boolean]> {
    return [fs.existsSync(this.absolutePath)];
  }

  async getMetadata(): Promise<[{ metadata?: Record<string, unknown>; contentType?: string; size?: number }]> {
    if (!fs.existsSync(this.absolutePath)) {
      throw new ObjectNotFoundError();
    }
    const stat = fs.statSync(this.absolutePath);
    let meta: Record<string, unknown> = {};
    const metaFile = `${this.absolutePath}.meta.json`;
    if (fs.existsSync(metaFile)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
      } catch {
        meta = {};
      }
    }
    return [{
      metadata: meta,
      size: stat.size,
      contentType: (meta['contentType'] as string) || 'application/octet-stream',
    }];
  }

  async setMetadata(meta: { metadata?: Record<string, unknown> }): Promise<unknown> {
    const metaFile = `${this.absolutePath}.meta.json`;
    const existing = (await this.getMetadata())[0].metadata || {};
    const merged = { ...existing, ...(meta.metadata || {}) };
    fs.mkdirSync(path.dirname(metaFile), { recursive: true });
    fs.writeFileSync(metaFile, JSON.stringify(merged), 'utf8');
    return merged;
  }

  createReadStream(): NodeJS.ReadableStream {
    return fs.createReadStream(this.absolutePath);
  }
}

export class ObjectStorageService {
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.STORAGE_DIR
      ? path.resolve(process.env.STORAGE_DIR)
      : path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || '';
    return Array.from(
      new Set(
        pathsStr
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      ),
    );
  }

  getPrivateObjectDir(): string {
    return process.env.PRIVATE_OBJECT_DIR || '/objects';
  }

  getLocalFilePath(objectPath: string): string {
    const sanitized = objectPath.replace(/^\/+/, '').replace(/[/\\]+/g, path.sep);
    return path.join(this.baseDir, sanitized);
  }

  async searchPublicObject(filePath: string): Promise<StorageFileLike | null> {
    const target = path.join(this.baseDir, 'public', filePath);
    if (fs.existsSync(target)) {
      return new LocalStorageFile(filePath, target);
    }
    return null;
  }

  async downloadObject(
    file: StorageFileLike,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file as any);
    const isPublic = aclPolicy?.visibility === 'public';

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream as any) as ReadableStream;

    const headers: Record<string, string> = {
      'Content-Type': (metadata.contentType as string) || 'application/octet-stream',
      'Cache-Control': `${isPublic ? 'public' : 'private'}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers['Content-Length'] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    return `/api/storage/uploads/direct?path=/objects/uploads/${objectId}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageFileLike> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }
    const localPath = this.getLocalFilePath(objectPath);
    if (!fs.existsSync(localPath)) {
      throw new ObjectNotFoundError();
    }
    return new LocalStorageFile(objectPath, localPath);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith('/api/storage/uploads/direct?path=')) {
      return decodeURIComponent(rawPath.split('path=')[1] || '');
    }
    if (rawPath.includes('?path=')) {
      const match = rawPath.match(/[?&]path=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith('/')) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile as any, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageFileLike;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile: objectFile as any,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
