import { Agent } from '@mastra/core/agent'
import { gemini20flash } from './models'
import { webMcp } from '../tools/web'

// サイト調査エージェント

export const webMcpTools = await webMcp.listTools()

// 🛠️ 改造ポイント
// 調査の内容に応じてinstructions(システムプロンプト)やmodelを変更する
export const surveyAgent = new Agent({
  id: 'surveyAgent',
  name: 'サイト調査エージェント',
  model: gemini20flash,
  instructions: `
あなたはWebサイトの調査員です。以下の調査をステップバイステップで説明しながら進めてください。

- ユーザーからはサイトの名前とURLが与えられます
- 必要に応じて次のツールを使ってください
  - ブラウザはツールのplaywright
  - Web検索はツールのbrave

# 調査の流れ

## URLと名前の確認と補正

- サイトのURLをブラウザで開き、そのサイトが名前に示すサイトと一致するか確認する
- 一致しない場合は、そのサイトの名前をWeb検索で探し、正しいURLに補正する
  - 検索の結果ツールを使い、ブラウザで修正したURLを開く
- 現在ブラウザで開いているURLを表示する

## アクセスランキングの確認

- ブラウザで現在開いているページに、アクセスランキングのセクションがあるかを確認する
  - アクセスランキングは人気記事や人気ランキングなどとも表現される
  - よく見られている記事へのリンクリストで、順位が表示されている
- アクセスランキングのセクションの有無と、セクションがある場合はその名称を表示する

以上で処理を終了する。
  `.trim(),
  defaultOptions: {
    maxSteps: 20,
  },
  tools: {
    ...webMcpTools,
  },
})
