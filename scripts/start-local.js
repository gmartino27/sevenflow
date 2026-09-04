process.env.SEVENFLOW_LOCAL_AUTH = process.env.SEVENFLOW_LOCAL_AUTH || 'true';
process.env.SEVENFLOW_LOCAL_USER_EMAIL = process.env.SEVENFLOW_LOCAL_USER_EMAIL || 'admin@sevenflow.local';
process.env.SEVENFLOW_LOCAL_USER_PASSWORD = process.env.SEVENFLOW_LOCAL_USER_PASSWORD || 'sevenflow';
process.env.SEVENFLOW_LOCAL_USER_ID = process.env.SEVENFLOW_LOCAL_USER_ID || 'local-user';
process.env.SEVENFLOW_LOCAL_SESSION_SECRET = process.env.SEVENFLOW_LOCAL_SESSION_SECRET || 'change-this-local-secret';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '8000';

require('../server');
