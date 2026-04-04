import express from 'express';
import { handler } from './build/handler.js';

const app = express();

app.get('/health-check', (_req, res) => {
	res.send({ message: 'Server up', status: 200 });
});

app.use(handler);

app.listen(8080);
