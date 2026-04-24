import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { requireUserOrMirror } from '../auth.js';

type Opts = FastifyPluginOptions & { attachmentsDir: string };

export async function attachmentRoutes(app: FastifyInstance, opts: Opts) {
  // Attachments are served from a dedicated plugin-scoped static handler.
  // Access requires a session; attachments are not public.
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireUserOrMirror);
    await scope.register(fastifyStatic, {
      root: path.resolve(opts.attachmentsDir),
      prefix: '/attachments/',
      decorateReply: false,
    });
  });
}
