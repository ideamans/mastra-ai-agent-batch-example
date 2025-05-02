import { Workflow, Step } from '@mastra/core/workflows'
import { z } from 'zod'
import { Lock } from 'async-await-mutex-lock'

import { useDocuments } from '../tools/documents'

// AIエージェントとGoogleスプレッドシートによるバッチ処理の実装

// Googleスプレッドシートによるドキュメント機能を利用する
const documents = await useDocuments()

// MCPの操作がテレコしないように繰り返しステップをロックする
const iterationLock = new Lock()

// 残タスクの読み込みステップ
export const loadBacklogStep = new Step({
  id: 'load-backlog',
  description: '残タスクのドキュメントを読み込む',
  execute: async ({ mastra }) => {
    const { length, errors } = await documents.load()
    for (const error of errors) {
      mastra?.getLogger()?.error(`(Load Backlog Step): 💣 ドキュメント読み込みエラー: ${error}`)
    }
    mastra?.getLogger()?.info(`(Load Backlog Step): 🗒️ 調査対象: ${length}件`)
  },
})

// 残タスクを繰り返し取り出し、AIエージェントによる調査を行うステップ
export const iterationStep = new Step({
  id: 'iteration',
  description: '残タスクの取り出しとAIエージェントによる調査を繰り返し行う',
  execute: async ({ mastra }) => {
    await iterationLock.acquire()

    try {
      // 以下の処理を行う
      // 1. 残タスクの取り出しと確認・ロック
      // 2. 調査エージェントによる調査とコメント作成
      // 3. 調査コメントを構造化してGoogleスプレッドシートを更新

      // 必要なエージェントを取得する
      const surveyAgent = mastra?.getAgent('surveyAgent')
      if (!surveyAgent) throw new Error('Agent not found')
      const structureAgent = mastra?.getAgent('structureAgent')
      if (!structureAgent) throw new Error('Agent not found')

      // 次の残タスクの取り出し
      const rowKey = documents.iterateBacklogKey()
      if (!rowKey) {
        mastra?.getLogger()?.warn('(Iteration Step): ⚠️ 調査対象がありません')
        return
      }

      // 並列処理では調査の重複がありえるので最新の情報を確認する
      const doc = await documents.get(rowKey)
      if (!doc || !!doc.data.状態) {
        mastra
          ?.getLogger()
          ?.info(`(Iteration Step): ⏭️ #${rowKey} は他のプロセスによる調査が行われているためスキップします`)
        return
      }

      mastra?.getLogger()?.info(`(Iteration Step): ▶️ 調査開始: #${rowKey} ${JSON.stringify(doc.data)}`)

      // 簡易的なロックの目的で状態: 調査中にする
      await documents.update(rowKey, { 状態: '調査中', エラー: undefined })

      try {
        // LLMからのテキストストリーム管理
        const all: string[] = []

        // バッファリングと適度な出力
        let buffer: string[] = []
        const flushEach = 80

        function flushStreamBuffer(force: boolean) {
          // 改行を含む場合はすぐに出力
          const maybeLines = buffer.join('')
          if (maybeLines.includes('\n')) {
            const lines = maybeLines.split('\n')

            // 最後の行だけは保留する
            const last = lines.pop()
            buffer = [last || '']

            for (const line of lines) {
              mastra?.getLogger()?.info(`(Iteration Step): ${line}`)
            }
          }

          // ある程度の長さに達したら出力
          const maybeLong = buffer.join('')
          if (force || maybeLong.length >= flushEach) {
            mastra?.getLogger()?.info(`(Iteration Step): ${buffer.join('')}`)
            buffer = []
          }
        }

        // 調査エージェントをテキストストリームで実行
        // 🛠️ 改造ポイント
        // 調査エージェントのプロンプトに応じて
        const prompt = JSON.stringify({ 名前: doc.data.名前, URL: doc.data.URL })
        const stream = await surveyAgent.stream(prompt)

        // テキストチャンクをバッファリング
        for await (const chunk of stream.textStream) {
          all.push(chunk)
          buffer.push(chunk)
          flushStreamBuffer(false)
        }

        // 残りのメッセージを出力
        if (buffer.length > 0) {
          flushStreamBuffer(true)
        }

        // 調査コメント
        const comment = all.join('')

        // 調査コメントから更新用のデータを生成する
        // 🛠️ 改造ポイント
        // src/mastra/tools/documents.tsのdataSchemaの変更に合わせて
        // outputのスキーマを変更する
        const updateData = await structureAgent.generate(
          `
    以下の調査コメントを構造化してください。
    アクセスランキングの有無=有りの場合はアクセスランキングの名称も出力してください。
    ---
    ${comment}
        `,
          {
            output: z.object({
              URL: z.string().optional().describe('調査されたURL'),
              アクセスランキングの有無: z.enum(['有り', '無し']),
              アクセスランキングの名称: z.string().optional().describe('アクセスランキングの名称'),
            }),
          }
        )

        // 調査が完了したら調査済みにする
        mastra
          ?.getLogger()
          ?.info(`(Iteration Step): ☑️ #${rowKey} 調査が完了しました: ${JSON.stringify(updateData.object)}`)
        await documents.update(rowKey, { ...updateData.object, 状態: '調査済み' })
      } catch (error) {
        mastra?.getLogger()?.error(`(Iteration Step): 💣 #${rowKey} エラーが発生しました: ${error}`)
        // エラーも記録する
        await documents.update(rowKey, { 状態: 'エラー', エラー: `${error}` })
      }
    } finally {
      await iterationLock.release()
    }
  },
})

// バッチ処理のワークフロー
export const batchWorkflow = new Workflow({
  name: 'Batch Workflow',
})
  .step(loadBacklogStep) // 残タスクを読み込む
  .while(async () => documents.hasBacklog(), iterationStep) // 残タスクがある間、繰り返し調査を行う
  .commit()
