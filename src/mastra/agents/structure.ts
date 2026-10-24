import { Agent } from '@mastra/core/agent'
import { gemini20flash } from './models'

// 調査結果を構造化データに変換するエージェント

export const structureAgent = new Agent({
  id: 'structureAgent',
  name: '構造化エージェント',
  model: gemini20flash,
  instructions: `
与えられたメッセージを出力スキーマに従い構造化してください。
  `.trim(),
})
