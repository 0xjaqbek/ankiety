import express from 'express';
import { createHandler } from './handler.js';

const app = express();
app.disable('x-powered-by');
app.use(createHandler({ requireRemote: true }));

export default app;
