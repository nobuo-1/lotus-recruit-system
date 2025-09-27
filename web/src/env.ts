import { config } from 'dotenv';

// 優先: .env.local → 次点: .env
config({ path: '.env.local' });
config(); // フォールバック（.env があれば）
