import app from './app.js';
import { env } from './config/env.js';
import { testDatabaseConnection } from './db/index.js';

async function start() {
  try {
    await testDatabaseConnection();
    app.listen(env.port, () => {
      console.log(`API listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error('Failed to start API:', error);
    process.exit(1);
  }
}

start();
