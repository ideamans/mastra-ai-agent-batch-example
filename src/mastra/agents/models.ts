// 比較するため複数のLLMを用意する
// Mastraのモデルルーター形式（"プロバイダー/モデル名"）で指定する
// APIキーは各プロバイダーの環境変数（GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY）から読み込まれる

// 提供終了で止まらないよう、版を固定せず最新の Flash を指す
export const geminiFlash = 'google/gemini-flash-latest'
export const claude35haiku = 'anthropic/claude-3-5-haiku-latest'
export const gpt41mini = 'openai/gpt-4.1-mini'
export const gpt41nano = 'openai/gpt-4.1-nano'
