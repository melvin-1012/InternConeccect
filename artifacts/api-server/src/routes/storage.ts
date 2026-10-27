import { Readable } from 'stream';
import { and, eq } from 'drizzle-orm';
import {
  CompleteMyResumeUploadBody,
  CompleteMyResumeUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import {
  applicationsTable,
  db,
  opportunitiesTable,
  resumeFilesTable,
  studentProfilesTable,
} from '@workspace/db';

import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';
import { appRoles, requireRole, type AppActor } from '../lib/placementAuth';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const studentOnly = requireRole('student');
const signedInOnly = requireRole(...appRoles);
const resumeContentTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function actorFrom(res: Response): AppActor {
  return res.locals.actor as AppActor;
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  studentOnly,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }
    const fileName = parsed.data.name.trim();
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (
      !fileName ||
      fileName.length > 180 ||
      !resumeContentTypes.has(parsed.data.contentType) ||
      !['pdf', 'doc', 'docx'].includes(extension ?? '')
    ) {
      res.status(400).json({ error: 'Upload a PDF, DOC, or DOCX resume up to 10 MB.' });
      return;
    }

    try {
      const actor = actorFrom(res);
      const { size, contentType } = parsed.data;
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);
      if (!objectPath.startsWith('/objects/uploads/')) {
        res.status(500).json({ error: 'Could not prepare a private resume upload.' });
        return;
      }

      await db.insert(resumeFilesTable).values({
        objectPath,
        ownerUserId: actor.id,
        name: fileName,
        size,
        contentType,
        status: 'pending',
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name: fileName, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

router.put(
  '/storage/uploads/direct',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rawPath = req.query.path as string;
      if (!rawPath || !rawPath.startsWith('/objects/uploads/')) {
        res.status(400).json({ error: 'Invalid upload path' });
        return;
      }
      const localFilePath = objectStorageService.getLocalFilePath(rawPath);
      const fs = await import('fs');
      const path = await import('path');
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });

      const writeStream = fs.createWriteStream(localFilePath);
      req.pipe(writeStream);

      writeStream.on('finish', () => {
        const contentType = req.headers['content-type'] || 'application/octet-stream';
        const metaFile = `${localFilePath}.meta.json`;
        fs.writeFileSync(metaFile, JSON.stringify({ contentType }), 'utf8');
        res.status(200).send('OK');
      });

      writeStream.on('error', (err) => {
        req.log.error({ err }, 'Error saving uploaded file');
        res.status(500).json({ error: 'Failed to save file' });
      });
    } catch (err) {
      req.log.error({ err }, 'Error processing direct upload');
      res.status(500).json({ error: 'Upload failed' });
    }
  },
);

router.post(
  '/me/resume',
  studentOnly,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CompleteMyResumeUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const actor = actorFrom(res);
    const [record] = await db
      .select()
      .from(resumeFilesTable)
      .where(
        and(
          eq(resumeFilesTable.objectPath, parsed.data.objectPath),
          eq(resumeFilesTable.ownerUserId, actor.id),
        ),
      )
      .limit(1);
    if (!record) {
      res.status(403).json({ error: 'That upload does not belong to this account.' });
      return;
    }

    let completedAt = record.completedAt;
    if (record.status !== 'complete') {
      try {
        await objectStorageService.trySetObjectEntityAclPolicy(record.objectPath, {
          owner: actor.id,
          visibility: 'private',
        });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          res.status(400).json({ error: 'The file upload has not completed yet.' });
          return;
        }
        throw error;
      }

      completedAt = new Date();
      await db
        .update(resumeFilesTable)
        .set({ status: 'complete', completedAt })
        .where(eq(resumeFilesTable.id, record.id));
      await db
        .update(studentProfilesTable)
        .set({ resumePath: record.objectPath })
        .where(eq(studentProfilesTable.userId, actor.id));
    }

    res.json(
      CompleteMyResumeUploadResponse.parse({
        objectPath: record.objectPath,
        name: record.name,
        size: record.size,
        contentType: record.contentType,
        uploadedAt: completedAt ?? new Date(),
      }),
    );
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get(
  '/storage/objects/*path',
  signedInOnly,
  async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = actorFrom(res);
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const [record] = await db
      .select()
      .from(resumeFilesTable)
      .where(
        and(
          eq(resumeFilesTable.objectPath, objectPath),
          eq(resumeFilesTable.status, 'complete'),
        ),
      )
      .limit(1);
    if (!record) {
      res.status(404).json({ error: 'Object not found' });
      return;
    }

    let permitted = actor.id === record.ownerUserId;
    if (actor.role === 'placement-officer' || actor.role === 'administrator') {
      permitted = true;
    } else if (actor.role === 'recruiter') {
      const [application] = await db
        .select({ id: applicationsTable.id })
        .from(applicationsTable)
        .innerJoin(
          opportunitiesTable,
          eq(opportunitiesTable.id, applicationsTable.opportunityId),
        )
        .where(
          and(
            eq(applicationsTable.studentUserId, record.ownerUserId),
            eq(opportunitiesTable.recruiterUserId, actor.id),
          ),
        )
        .limit(1);
      permitted = Boolean(application);
    }
    if (!permitted) {
      res.status(403).json({ error: 'You do not have access to this resume.' });
      return;
    }

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    if (
      actor.id === record.ownerUserId &&
      !(await objectStorageService.canAccessObjectEntity({
        userId: actor.id,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      }))
    ) {
      res.status(403).json({ error: 'You do not have access to this resume.' });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${record.name.replace(/["\\]/g, '')}"`,
    );

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
  },
);

export default router;
