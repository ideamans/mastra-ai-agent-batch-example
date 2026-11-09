import { Agent } from '@mastra/core/agent'
import { geminiFlash } from './models'

// 調査結果を構造化データに変換するエージェント

export const structureAgent = new Agent({
  id: 'structureAgent',
  name: '構造化エージェント',
  model: geminiFlash,
  instructions: `
与えられたメッセージを出力スキーマに従い構造化してください。
  `.trim(),
})
