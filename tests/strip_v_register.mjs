// テスト用：JS の読み込み先についている「?v=版」（キャッシュ対策）を外して読む。
// 外さないと、同じファイルが別のものとして2回読み込まれ、設定（CONFIG など）が食い違う
import { register } from 'node:module';
register('./strip_v_hooks.mjs', import.meta.url);
